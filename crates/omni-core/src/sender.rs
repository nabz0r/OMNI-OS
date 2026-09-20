//! Analytics egress accepts only the closed, already-randomized Report type.
//! It has no vault handle, prompt parameter, bearer token, or logging sink.
//! This API boundary is not an operating-system confinement claim.
use crate::analytics::Report;
use anyhow::{bail, Result};
use serde_json::{json, Value};

pub async fn send(client: &reqwest::Client, url: &str, report: &Report) -> Result<Value> {
    let response = client
        .post(url)
        .timeout(std::time::Duration::from_secs(20))
        .json(report)
        .send()
        .await
        .map_err(|_| {
            anyhow::anyhow!(
                "Analytics collector unavailable; the same prepared report can be retried"
            )
        })?;
    let status = response.status();
    if !status.is_success() {
        bail!(
            "Analytics collector rejected the report (HTTP {})",
            status.as_u16()
        );
    }
    // The response contains only delivery status for the UI; no user credential
    // is sent to the collector and no output is added to the personal memory.
    Ok(
        json!({"accepted":true,"report_id":report.report_id,"week":report.week,"http_status":status.as_u16()}),
    )
}
