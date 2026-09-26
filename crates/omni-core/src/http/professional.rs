use super::*;

pub(super) async fn view(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    Ok(Json(state.vault()?.work_view()?))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Enrollment {
    label: String,
    acknowledge_single_owner: bool,
}
pub(super) async fn enable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Enrollment>,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    if !input.acknowledge_single_owner {
        return Err(ApiError::bad(
            "Confirm that this is a dedicated work installation for one OS user",
        ));
    }
    state.vault()?.enable_work(&input.label)?;
    Ok(Json(state.vault()?.work_view()?))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Approval {
    label: String,
    destinations: Vec<String>,
    expires_in_seconds: i64,
}
pub(super) async fn approve(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Approval>,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    let mut vault = state.vault()?;
    let providers = vault.providers()?;
    let destinations = input
        .destinations
        .iter()
        .map(|d| normalize_base(d))
        .collect::<anyhow::Result<Vec<_>>>()?;
    if destinations.iter().any(|d| {
        !providers
            .iter()
            .any(|p| &p.base_url == d && p.policy_allowed(&state.config))
    }) {
        return Err(ApiError::bad(
            "Approve only configured, policy-allowed provider destinations",
        ));
    }
    Ok(Json(vault.create_work_client(
        &input.label,
        destinations,
        input.expires_in_seconds,
    )?))
}
pub(super) async fn revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    auth(&headers, &state, true)?;
    if !state.vault()?.revoke_client(&id)? {
        return Err(ApiError(StatusCode::NOT_FOUND, "Client not found".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn conversations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    Ok(Json(
        json!({"conversations":state.vault()?.conversations()?}),
    ))
}
pub(super) async fn create_conversation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<crate::continuity::ConversationInput>,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    let mut vault = state.vault()?;
    let provider = vault.selected_provider(Some(&input.provider_id), None, &state.config)?;
    Ok(Json(json!(
        vault.create_conversation(input, &provider.base_url)?
    )))
}
pub(super) async fn read_conversation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    Ok(Json(state.vault()?.conversation_messages(&id)?))
}
pub(super) async fn delete_conversation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    auth(&headers, &state, true)?;
    if !state.vault()?.delete_conversation(&id)? {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "Conversation not found".into(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ClearAttempt {
    request_id: String,
    acknowledge_possible_delivery: bool,
}
pub(super) async fn clear_attempt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<ClearAttempt>,
) -> ApiResult<StatusCode> {
    auth(&headers, &state, true)?;
    if !input.acknowledge_possible_delivery {
        return Err(ApiError::bad(
            "Acknowledge that the previous request may already have reached the provider",
        ));
    }
    state
        .vault()?
        .clear_conversation_attempt(&id, &input.request_id)?;
    Ok(StatusCode::NO_CONTENT)
}

static RECOVERY_SLOT: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ExportRecovery {
    passphrase: String,
}
pub(super) async fn export_recovery(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ExportRecovery>,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    let permit = RECOVERY_SLOT.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Another recovery operation is running".into(),
        )
    })?;
    let snapshot = state.vault()?.recovery_snapshot()?;
    let password = zeroize::Zeroizing::new(input.passphrase);
    let archive = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        crate::recovery::seal(snapshot, password)
    })
    .await
    .map_err(|_| ApiError::internal("Recovery worker stopped"))??;
    state.vault()?.journal_audit(
        "recovery_exported",
        &crate::journal::AuditDetails::default(),
    )?;
    Ok(Json(json!(archive)))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RestoreRecovery {
    passphrase: String,
    archive: crate::recovery::Archive,
    acknowledge_revoked_access: bool,
}
pub(super) async fn restore_recovery(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RestoreRecovery>,
) -> ApiResult<Json<Value>> {
    auth(&headers, &state, true)?;
    if !input.acknowledge_revoked_access {
        return Err(ApiError::bad(
            "Confirm restoration into an unused installation with all sharing permissions revoked",
        ));
    }
    let permit = RECOVERY_SLOT.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Another recovery operation is running".into(),
        )
    })?;
    if !state.vault()?.recovery_empty()? {
        return Err(ApiError::bad(
            "Restore requires an unused installation; existing work is never overwritten",
        ));
    }
    let password = zeroize::Zeroizing::new(input.passphrase);
    let vault = state.vault.clone();
    let result = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let mut vault = vault
            .lock()
            .map_err(|_| anyhow::anyhow!("Vault unavailable"))?;
        crate::recovery::restore(&mut vault, input.archive, password)
    })
    .await
    .map_err(|_| ApiError::internal("Recovery worker stopped"))??;
    Ok(Json(result))
}
