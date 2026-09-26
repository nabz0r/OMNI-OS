use super::*;
const OWNER: &str = "admin-token-0123456789";
async fn invoke(
    router: &Router,
    method: &str,
    path: &str,
    token: &str,
    grant: Option<&str>,
    body: Value,
) -> (StatusCode, Value, HeaderMap) {
    let mut req = axum::http::Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json");
    if let Some(grant) = grant {
        req = req.header("x-omni-grant", grant);
    }
    let response = router
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        headers,
    )
}
async fn owner(router: &Router, method: &str, path: &str, body: Value) -> Value {
    let (status, value, _) = invoke(router, method, path, OWNER, None, body).await;
    assert!(status.is_success(), "{path}: {status} {value}");
    value
}
#[tokio::test]
async fn controlled_context_loop_two_approved_clients_and_revocation_stop_egress() {
    let (tx, mut received) = tokio::sync::mpsc::unbounded_channel();
    let upstream=provider(Router::new().fallback(post(move |Json(body):Json<Value>| {let tx=tx.clone();async move {
        tx.send(body.clone()).unwrap();
        let extract=body.get("response_format").is_some();
        Json(json!({"choices":[{"message":{"content":if extract {"{\"memories\":[{\"content\":\"Use EUR for the synthetic Atlas work project.\"}]}"}else{"Synthetic answer"}}}]}))
    }}))).await;
    let (_dir, mut state) = test_state();
    use_provider(&mut state, &upstream);
    Arc::make_mut(&mut state.config).extractor_base = state.config.llm_base.clone();
    let router = app(state.clone());
    owner(
        &router,
        "POST",
        "/api/work",
        json!({"label":"Synthetic work installation","acknowledge_single_owner":true}),
    )
    .await;
    assert_eq!(
        invoke(
            &router,
            "POST",
            "/v1/chat/completions",
            "agent-token-0123456789",
            None,
            json!({"model":"test","messages":[]})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let content=json!({"format":"omni-reviewed-conversation-v1","provider":"Other","title":"Synthetic preference","messages":[{"role":"user","text":"Use EUR for the synthetic Atlas work project."}]}).to_string();
    let imported = owner(
        &router,
        "POST",
        "/api/capture",
        json!({"source":"other_export_review","content":content}),
    )
    .await;
    assert_eq!(imported["memories"][0]["status"], "proposed");
    assert!(received.try_recv().is_ok());
    assert!(state.vault().unwrap().grants().unwrap().is_empty());
    let memory = imported["memories"][0]["id"].as_str().unwrap();
    owner(
        &router,
        "PATCH",
        &format!("/api/memories/{memory}"),
        json!({"status":"confirmed"}),
    )
    .await;
    let destination = state.config.llm_base.clone();
    let mut identities = vec![];
    for name in ["Reference JS client", "Reference Python client"] {
        let client = owner(
            &router,
            "POST",
            "/api/work/clients",
            json!({"label":name,"destinations":[destination],"expires_in_seconds":3600}),
        )
        .await;
        let grant = owner(
            &router,
            "POST",
            "/api/grants",
            json!({"destination":destination,"scope":[memory],"client_id":client["id"]}),
        )
        .await;
        identities.push((client, grant));
    }
    let request = json!({"model":"test","messages":[{"role":"user","content":"Prepare a synthetic budget."}],"stream":false});
    for (client, grant) in &identities {
        let (status, _, headers) = invoke(
            &router,
            "POST",
            "/v1/chat/completions",
            client["token"].as_str().unwrap(),
            grant["id"].as_str(),
            request.clone(),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let sent = received
            .try_recv()
            .expect("Allowed request did not reach provider");
        assert!(sent.to_string().contains("Use EUR for the synthetic Atlas"));
        let id = headers["x-omni-receipt"].to_str().unwrap();
        let receipt = state
            .vault()
            .unwrap()
            .receipts()
            .unwrap()
            .into_iter()
            .find(|r| r.id == id)
            .unwrap();
        assert_eq!(receipt.memory_ids, vec![memory]);
        assert_eq!(receipt.destination, destination);
        assert_eq!(receipt.status, "sent");
        for path in ["/api/state", "/api/work", "/api/conversations"] {
            assert_eq!(
                invoke(
                    &router,
                    "GET",
                    path,
                    client["token"].as_str().unwrap(),
                    None,
                    Value::Null
                )
                .await
                .0,
                StatusCode::UNAUTHORIZED
            );
        }
    }
    let (a, grant_a) = &identities[0];
    let (b, grant_b) = &identities[1];
    assert_eq!(
        invoke(
            &router,
            "POST",
            "/v1/chat/completions",
            a["token"].as_str().unwrap(),
            grant_b["id"].as_str(),
            request.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert!(
        received.try_recv().is_err(),
        "Foreign client grant leaked upstream"
    );
    owner(
        &router,
        "DELETE",
        &format!("/api/grants/{}", grant_a["id"].as_str().unwrap()),
        Value::Null,
    )
    .await;
    assert_eq!(
        invoke(
            &router,
            "POST",
            "/v1/chat/completions",
            a["token"].as_str().unwrap(),
            grant_a["id"].as_str(),
            request.clone()
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert!(
        received.try_recv().is_err(),
        "Revoked grant leaked upstream"
    );
    owner(
        &router,
        "DELETE",
        &format!("/api/work/clients/{}", b["id"].as_str().unwrap()),
        Value::Null,
    )
    .await;
    assert_eq!(
        invoke(
            &router,
            "POST",
            "/v1/chat/completions",
            b["token"].as_str().unwrap(),
            grant_b["id"].as_str(),
            request.clone()
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert!(
        received.try_recv().is_err(),
        "Revoked client reached upstream"
    );
    let work = owner(&router, "GET", "/api/work", Value::Null).await;
    assert_eq!(work["requests"].as_array().unwrap().len(), 2);
    assert!(!work.to_string().contains(a["token"].as_str().unwrap()));
    assert!(!work.to_string().contains("Use EUR"));
}

#[tokio::test]
async fn saved_conversations_reauthorize_before_selection_deduplicate_and_delete() {
    let (tx, mut received) = tokio::sync::mpsc::unbounded_channel();
    let upstream=provider(Router::new().fallback(post(move |Json(body):Json<Value>| {let tx=tx.clone();async move {tx.send(body).unwrap();Json(json!({"choices":[{"message":{"content":"A model suggestion, not a human fact."}}]}))}}))).await;
    let (_dir, mut state) = test_state();
    use_provider(&mut state, &upstream);
    let router = app(state.clone());
    let memory = owner(
        &router,
        "POST",
        "/api/memories",
        json!({"content":"Synthetic approved fact","status":"confirmed"}),
    )
    .await;
    let grant = owner(
        &router,
        "POST",
        "/api/grants",
        json!({"destination":state.config.llm_base,"scope":[memory["id"]]}),
    )
    .await;
    let provider_id = state
        .vault()
        .unwrap()
        .admin_settings()
        .unwrap()
        .primary_provider_id;
    let create = json!({"title":"Atlas","scope":"Project Atlas","provider_id":provider_id,"model":"test","grant_id":grant["id"],"retention_days":7,"consent":true});
    let mut no_consent = create.clone();
    no_consent["consent"] = json!(false);
    assert_eq!(
        invoke(
            &router,
            "POST",
            "/api/conversations",
            OWNER,
            None,
            no_consent
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let thread = owner(&router, "POST", "/api/conversations", create).await;
    let id = thread["id"].as_str().unwrap();
    let request = json!({"message":"Human project statement","provider_id":provider_id,"model":"test","grant_id":grant["id"],"conversation_id":id,"conversation_revision":0,"request_id":uuid::Uuid::new_v4().to_string()});
    let reply = owner(&router, "POST", "/api/chat", request.clone()).await;
    assert_eq!(reply["stored"], true);
    assert!(received.try_recv().is_ok());
    let replay = owner(&router, "POST", "/api/chat", request.clone()).await;
    assert_eq!(replay["replayed"], true);
    assert!(received.try_recv().is_err());
    let mut reused = request.clone();
    reused["message"] = json!("Different content");
    assert_eq!(
        invoke(&router, "POST", "/api/chat", OWNER, None, reused)
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert!(received.try_recv().is_err());
    let read = owner(
        &router,
        "GET",
        &format!("/api/conversations/{id}"),
        Value::Null,
    )
    .await;
    assert_eq!(
        read["turns"][0]["human_statement"],
        "Human project statement"
    );
    assert_eq!(
        read["turns"][0]["model_suggestion"],
        "A model suggestion, not a human fact."
    );
    assert_eq!(
        state.vault().unwrap().memories().unwrap().len(),
        1,
        "AI reply was promoted to memory"
    );
    let mut next = request.clone();
    next["request_id"] = json!(uuid::Uuid::new_v4().to_string());
    next["conversation_revision"] = json!(1);
    next["message"] = json!("Continue");
    owner(&router, "POST", "/api/chat", next.clone()).await;
    let sent = received.try_recv().unwrap();
    assert!(sent.to_string().contains("Human project statement"));
    assert!(sent.to_string().contains("A model suggestion"));
    owner(
        &router,
        "DELETE",
        &format!("/api/grants/{}", grant["id"].as_str().unwrap()),
        Value::Null,
    )
    .await;
    next["conversation_revision"] = json!(2);
    next["request_id"] = json!(uuid::Uuid::new_v4().to_string());
    assert!(!invoke(&router, "POST", "/api/chat", OWNER, None, next)
        .await
        .0
        .is_success());
    assert!(
        received.try_recv().is_err(),
        "Revoked stored context reached provider"
    );
    owner(
        &router,
        "DELETE",
        &format!("/api/conversations/{id}"),
        Value::Null,
    )
    .await;
    assert!(state.vault().unwrap().conversations().unwrap().is_empty());
    assert_eq!(
        state
            .vault()
            .unwrap()
            .db
            .query_row("SELECT count(*) FROM continuity_turns", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
