use super::*;
use crate::policy::{CompiledPolicy, PolicySpec, Rule, RuleAction};
const OWNER: &str = "admin-token-0123456789";
const AGENT: &str = "agent-token-0123456789";
fn restrictive() -> PolicySpec {
    PolicySpec {
        allowed_extensions: vec!["txt".into()],
        max_file_bytes: 64,
        rules: vec![Rule {
            id: "restricted-text".into(),
            name: "Restricted text".into(),
            pattern: "(?i)POLICY-CANARY".into(),
            action: RuleAction::BlockMatch,
            enabled: true,
        }],
        ..Default::default()
    }
}

#[tokio::test]
async fn reviewed_conversations_inspect_decoded_text_before_extraction() {
    let (tx, mut received) = tokio::sync::mpsc::unbounded_channel();
    let provider = provider(Router::new().fallback(post(move |Json(body): Json<Value>| {
        let tx = tx.clone();
        async move {
            tx.send(body).unwrap();
            Json(json!({"choices":[{"message":{"content":"{\"memories\":[{\"content\":\"Synthetic approved context\"}]}"}}]}))
        }
    }))).await;
    let (_dir, mut state) = test_state();
    use_provider(&mut state, &provider);
    let mut policy = restrictive();
    policy.rules[0].pattern = r"(?i)classification\s*:\s*restricted".into();
    state.vault().unwrap().policy_save(0, policy).unwrap();
    let router = app(state.clone());
    for source in [
        "chatgpt_export_review",
        "claude_export_review",
        "other_export_review",
        "manual_capture",
    ] {
        let content = json!({"format":"omni-reviewed-conversation-v1","provider":"ChatGPT","title":"Synthetic","messages":[{"role":"user","text":"Classification:\nrestricted"}]}).to_string();
        let response = call(
            &router,
            "/api/capture",
            Some(json!({"content":content,"source":source})),
        )
        .await;
        assert_eq!(response.0, StatusCode::FORBIDDEN, "{}", response.1);
        assert!(
            received.try_recv().is_err(),
            "Denied conversation reached extractor"
        );
        assert!(state.vault().unwrap().memories().unwrap().is_empty());
    }
    let valid = json!({"format":"omni-reviewed-conversation-v1","provider":"Claude","title":"Synthetic","messages":[{"role":"user","text":"Approved synthetic context"}]}).to_string();
    let response = call(
        &router,
        "/api/capture",
        Some(json!({"content":valid,"source":"claude_export_review"})),
    )
    .await;
    assert_eq!(response.0, StatusCode::OK, "{}", response.1);
    assert_eq!(response.1["memories"][0]["status"], "proposed");
    assert!(received.try_recv().is_ok());
    assert!(state.vault().unwrap().grants().unwrap().is_empty());
    for content in [
        "not JSON".to_owned(),
        json!({"format":"omni-reviewed-conversation-v1","provider":"Other","title":"x","messages":[{"role":"system","text":"Invalid role"}]}).to_string(),
        json!({"format":"omni-reviewed-conversation-v1","provider":"Other","title":"x","messages":[],"unknown":"field"}).to_string(),
    ] {
        let response = call(&router, "/api/capture", Some(json!({"content":content,"source":"other_export_review"}))).await;
        assert_eq!(response.0, StatusCode::BAD_REQUEST);
        assert!(received.try_recv().is_err());
    }
    assert_eq!(state.vault().unwrap().memories().unwrap().len(), 1);
}
async fn call(router: &Router, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    request(router.clone(), path, Some(OWNER), None, body).await
}
#[tokio::test]
async fn administration_validates_atomically_restricts_agents_and_previews_without_logging() {
    let (_dir, state) = test_state();
    let router = app(state.clone());
    for (path, body) in [
        ("/api/policies", None),
        ("/api/policies/decisions", None),
        (
            "/api/policies",
            Some(json!({"expected_revision":0,"policy":restrictive()})),
        ),
        ("/api/policies/test", Some(json!({"body":{"messages":[]}}))),
    ] {
        assert_eq!(
            request(router.clone(), path, Some(AGENT), None, body)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }
    let mut invalid = restrictive();
    invalid.rules[0].pattern = "(".into();
    assert_eq!(
        call(
            &router,
            "/api/policies",
            Some(json!({"expected_revision":0,"policy":invalid}))
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(call(&router, "/api/policies", None).await.1["revision"], 0);
    assert_eq!(
        call(
            &router,
            "/api/policies",
            Some(json!({"expected_revision":0,"policy":restrictive()}))
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &router,
            "/api/policies",
            Some(json!({"expected_revision":0,"policy":PolicySpec::default()}))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    for text in ["PUBLIC", "POLICY-CANARY"] {
        let preview = call(
            &router,
            "/api/policies/test",
            Some(json!({"body":{"messages":[{"role":"user","content":text}]}})),
        )
        .await;
        assert_eq!(preview.0, StatusCode::OK);
        assert_eq!(preview.1["allowed"], text == "PUBLIC");
    }
    assert_eq!(
        call(&router, "/api/policies/decisions", None).await.1["retained"],
        0
    );
    assert_eq!(call(&router, "/api/policies", None).await.1["revision"], 1);
}
#[tokio::test]
async fn all_gateway_paths_block_before_egress_including_history_tools_and_granted_memory() {
    let (tx, mut received) = tokio::sync::mpsc::unbounded_channel();
    let provider = provider(Router::new().fallback(post(move |Json(body): Json<Value>| {
        let tx = tx.clone();
        async move {
            tx.send(body).unwrap();
            Json(json!({"choices":[{"message":{"content":"Accepted"}}]}))
        }
    })))
    .await;
    let (_dir, mut state) = test_state();
    use_provider(&mut state, &provider);
    let base = state.config.llm_base.clone();
    Arc::make_mut(&mut state.config).anthropic_base = base.clone();
    let grant = {
        let mut vault = state.vault().unwrap();
        vault
            .patch_admin_settings(crate::administration::SettingsPatch {
                history_enabled: Some(false),
                ..Default::default()
            })
            .unwrap();
        vault.policy_save(0, restrictive()).unwrap();
        vault
            .add_memory(
                "POLICY-CANARY in authorized memory",
                "confirmed",
                "manual",
                &json!({}),
            )
            .unwrap();
        vault.create_grant(&base, vec!["*".into()], 3600).unwrap()
    };
    let router = app(state.clone());
    let mut cases = vec![
        ("/api/chat", json!({"message":"POLICY-CANARY"})),
        (
            "/api/chat",
            json!({"message":"Current harmless text","history":[{"role":"user","content":"POLICY-CANARY"},{"role":"assistant","content":"ok"}]}),
        ),
        (
            "/api/chat",
            json!({"message":"Use my memory","grant_id":grant.id}),
        ),
        (
            "/api/capture",
            json!({"content":"POLICY-CANARY in a source","source":"browser"}),
        ),
    ];
    for path in ["/v1/chat/completions", "/v1/messages"] {
        for content in [
            json!("POLICY-CANARY"),
            json!([{"type":"text","text":"POLICY-CANARY"}]),
            json!([{"type":"tool_result","tool_use_id":"tool","content":"POLICY-CANARY"}]),
        ] {
            cases.push((path,json!({"model":"test","stream":true,"messages":[{"role":"user","content":content}]})));
        }
        cases.push((path,json!({"model":"test","messages":[{"role":"assistant","tool_calls":[{"function":{"name":"tool","arguments":"{\"value\":\"POLICY-CANARY\"}"}}]}]})));
    }
    for (path, body) in cases {
        let token = if path.starts_with("/v1/") {
            AGENT
        } else {
            OWNER
        };
        let response = request(router.clone(), path, Some(token), None, Some(body)).await;
        assert_eq!(response.0, StatusCode::FORBIDDEN, "{path}: {}", response.1);
        assert!(response.1.to_string().contains("restricted-text"));
        assert!(!response.1.to_string().contains("POLICY-CANARY"));
        assert!(
            received.try_recv().is_err(),
            "Blocked payload reached the provider"
        );
    }
    let vault = state.vault().unwrap();
    assert!(vault.receipts().unwrap().is_empty());
    assert_eq!(vault.interaction_count().unwrap(), 0);
    let decisions = vault.policy_decisions(100).unwrap();
    assert!(decisions["blocked"].as_u64().unwrap() >= 10);
    assert!(!decisions.to_string().contains("POLICY-CANARY"));
}
#[tokio::test]
async fn files_are_inspected_forwarded_as_text_and_rechecked_in_followups() {
    let (tx, mut received) = tokio::sync::mpsc::unbounded_channel();
    let provider = provider(Router::new().route(
        "/v1/chat/completions",
        post(move |Json(body): Json<Value>| {
            let tx = tx.clone();
            async move {
                tx.send(body).unwrap();
                Json(json!({"choices":[{"message":{"content":"Accepted"}}]}))
            }
        }),
    ))
    .await;
    let (_dir, mut state) = test_state();
    use_provider(&mut state, &provider);
    state
        .vault()
        .unwrap()
        .policy_save(0, restrictive())
        .unwrap();
    let router = app(state.clone());
    let file =
        json!({"name":"project.txt","media_type":"text/plain","text":"A public project update"});
    let message = json!({"message":"Summarize","attachments":[file.clone()]});
    assert_eq!(
        call(&router, "/api/chat", Some(message)).await.0,
        StatusCode::OK
    );
    let forwarded = received.recv().await.unwrap();
    assert!(forwarded.get("omni_attachments").is_none());
    assert_eq!(forwarded["messages"][0]["content"][1]["type"], "text");
    assert!(forwarded.to_string().contains("A public project update"));
    let preview = call(&router,"/api/policies/test",Some(json!({"body":{"model":"test","stream":false,"messages":[{"role":"user","content":"Summarize"}]},"attachments":[file.clone()]}))).await;
    let actual = call(&router, "/api/policies/decisions", None).await.1;
    assert_eq!(
        preview.1["request_bytes"],
        actual["items"][0]["request_bytes"]
    );
    for rejected in [
        json!({"name":"report.csv","media_type":"text/csv","text":"public"}),
        json!({"name":"project.txt","media_type":"text/plain","text":"POLICY-CANARY"}),
        json!({"name":"project.txt","media_type":"text/plain","text":"x".repeat(65)}),
        json!({"name":"project.txt","media_type":"application/pdf","text":"public"}),
        json!({"name":"project.txt","media_type":"text/plain","text":"%PDF-disguised"}),
    ] {
        assert_eq!(
            call(
                &router,
                "/api/chat",
                Some(json!({"message":"Summarize","attachments":[rejected]}))
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert!(received.try_recv().is_err());
    }
    for content in [
        json!([{"type":"image_url","image_url":{"url":"https://example.test/picture"}}]),
        json!([{"type":"file","file":{"file_id":"opaque"}}]),
        json!([{"type":"tool_result","content":[{"type":"document","source":{"type":"url","url":"https://example.test/document"}}]}]),
    ] {
        assert_eq!(
            call(
                &router,
                "/v1/chat/completions",
                Some(json!({"model":"test","messages":[{"role":"user","content":content}]}))
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert!(received.try_recv().is_err());
    }
    let mut spec = restrictive();
    spec.max_files = 0;
    state.vault().unwrap().policy_save(1, spec).unwrap();
    assert_eq!(call(&router,"/api/chat",Some(json!({"message":"Follow up","history":[{"role":"user","content":"Summarize","attachments":[file]},{"role":"assistant","content":"Accepted"}]}))).await.0,StatusCode::FORBIDDEN);
    assert!(received.try_recv().is_err());
    let decisions = call(&router, "/api/policies/decisions", None).await.1;
    assert!(!decisions.to_string().contains("project.txt"));
    assert!(!decisions.to_string().contains("A public project update"));
}
#[tokio::test]
async fn managed_baseline_survives_local_relaxation_and_mcp_grants_do_not_bypass_policy() {
    let (_dir, mut state) = test_state();
    Arc::make_mut(&mut state.config).managed_policy =
        Some(Arc::new(CompiledPolicy::compile(restrictive()).unwrap()));
    let grant = {
        let mut vault = state.vault().unwrap();
        vault
            .add_memory("POLICY-CANARY", "confirmed", "manual", &json!({}))
            .unwrap();
        vault
            .create_grant("https://omni.local/mcp", vec!["*".into()], 3600)
            .unwrap()
    };
    let router = app(state.clone());
    assert_eq!(
        call(
            &router,
            "/api/policies",
            Some(json!({"expected_revision":0,"policy":PolicySpec::default()}))
        )
        .await
        .0,
        StatusCode::OK
    );
    let preview = call(
        &router,
        "/api/policies/test",
        Some(json!({"body":{"messages":[{"role":"user","content":"POLICY-CANARY"}]}})),
    )
    .await
    .1;
    assert_eq!(preview["allowed"], false);
    assert_eq!(preview["layer"], "managed");
    let mcp = request(router,"/mcp",Some(AGENT),None,Some(json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_search","arguments":{"grant_id":grant.id,"query":""}}}))).await;
    assert!(!mcp.1.to_string().contains("POLICY-CANARY"));
    assert!(mcp.1.get("error").is_some());
    assert!(state.vault().unwrap().receipts().unwrap().is_empty());
    let decisions = state.vault().unwrap().policy_decisions(100).unwrap();
    assert_eq!(decisions["items"][0]["layer"], "managed");
    assert_eq!(decisions["items"][0]["operation"], "mcp");
}
