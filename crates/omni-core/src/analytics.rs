//! Fixed-schema local DP. This module does not perform network requests. This is
//! auditable code organization, not an OS sandbox or a claim of anonymity.
use crate::vault::{now, Vault};
use anyhow::{bail, Context, Result};
use chrono::{Datelike, NaiveDate, Utc, Weekday};
use opendp::{
    domains::{AtomDomain, VectorDomain},
    measurements::make_laplace,
    measures::MaxDivergence,
    metrics::L1Distance,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const TOPICS: [&str; 8] = [
    "inactive", "other", "coding", "writing", "research", "planning", "learning", "business",
];
pub const LATENCY: [&str; 8] = [
    "inactive",
    "unknown",
    "under_250ms",
    "250ms_1s",
    "1s_3s",
    "3s_10s",
    "10s_30s",
    "over_30s",
];
pub const TOKENS: [&str; 8] = [
    "inactive",
    "unknown",
    "under_128",
    "128_512",
    "512_2048",
    "2048_8192",
    "8192_32768",
    "over_32768",
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Histograms {
    pub topics: [f64; 8],
    pub latency: [f64; 8],
    pub tokens: [f64; 8],
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Report {
    pub schema_version: u8,
    pub report_id: String,
    pub week: String,
    pub epsilon: f64,
    pub histograms: Histograms,
}

pub fn current_week() -> String {
    let week = Utc::now().iso_week();
    format!("{}-W{:02}", week.year(), week.week())
}
pub fn validate_week(week: &str) -> Result<()> {
    if week.len() != 8
        || !week.is_ascii()
        || &week[4..6] != "-W"
        || !week[..4].bytes().all(|byte| byte.is_ascii_digit())
        || !week[6..].bytes().all(|byte| byte.is_ascii_digit())
    {
        bail!("Week must be YYYY-Www");
    }
    let year: i32 = week[..4].parse()?;
    let number: u32 = week[6..].parse()?;
    NaiveDate::from_isoywd_opt(year, number, Weekday::Mon).context("Invalid ISO week")?;
    Ok(())
}

impl Vault {
    pub fn prepare_report(
        &mut self,
        week: &str,
        consent_default: bool,
        simulation: bool,
    ) -> Result<Report> {
        validate_week(week)?;
        if !self.consent(consent_default)? {
            bail!("Analytics consent is disabled");
        }
        let tx = self.db.transaction()?;
        let existing: Option<String> = tx
            .query_row(
                "SELECT payload FROM analytics_reports WHERE week=?1",
                [week],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(payload) = existing {
            return Ok(serde_json::from_str(&payload)?);
        }
        // Replaying an already released report spends no new privacy budget.
        // A week rollover must not prevent retrying that immutable report.
        if !simulation && week != current_week() {
            bail!("New production reports can only be prepared for the current ISO week");
        }
        let count: i64 =
            tx.query_row("SELECT count(*) FROM analytics_reports", [], |r| r.get(0))?;
        if count >= 4 {
            bail!("Lifetime pilot privacy budget exhausted (four reports maximum)");
        }
        let mut h = Histograms {
            topics: [0.; 8],
            latency: [0.; 8],
            tokens: [0.; 8],
        };
        {
            let mut stmt = tx.prepare(
                "SELECT topic,latency_bucket,token_bucket FROM interactions WHERE week=?1",
            )?;
            let rows = stmt.query_map([week], |r| {
                Ok((
                    r.get::<_, u8>(0)? as usize,
                    r.get::<_, u8>(1)? as usize,
                    r.get::<_, u8>(2)? as usize,
                ))
            })?;
            let mut counts = [[0u64; 8]; 3];
            let mut n = 0u64;
            for row in rows {
                let (t, l, k) = row?;
                if t >= 8 || l >= 8 || k >= 8 {
                    bail!("Invalid local metric category");
                }
                counts[0][t] += 1;
                counts[1][l] += 1;
                counts[2][k] += 1;
                n += 1;
            }
            // Quantize on an exact binary lattice before applying OpenDP.
            // The eight f64 values sum exactly to one; no rounding-induced
            // sensitivity overshoot. Residue goes to other/unknown (index 1).
            for (histogram, counts) in [&mut h.topics, &mut h.latency, &mut h.tokens]
                .into_iter()
                .zip(counts)
            {
                if n == 0 {
                    histogram[0] = 1.;
                } else {
                    let mut units = [0u64; 8];
                    for (i, count) in counts.iter().enumerate() {
                        units[i] = ((*count as u128) * 65_536 / (n as u128)) as u64;
                    }
                    units[1] += 65_536 - units.iter().sum::<u64>();
                    for (i, value) in units.iter().enumerate() {
                        histogram[i] = (*value as f64) / 65_536.;
                    }
                }
            }
        }
        // Under replacement of an entire installation-week, every normalized
        // histogram has L1 sensitivity <= 2. Scale 6 => epsilon <= 1/3 each.
        // OpenDP samples on discrete support to avoid naive floating sampling.
        // A tiny conservative increase keeps upward-rounded privacy-map
        // arithmetic strictly below the allocated epsilon = 1/3.
        let mechanism = make_laplace::<_, _, MaxDivergence>(
            VectorDomain::new(AtomDomain::<f64>::new_non_nan()),
            L1Distance::<f64>::default(),
            6.00000000000001,
            None,
        )
        .map_err(|e| anyhow::anyhow!("OpenDP construction failed: {e}"))?;
        let epsilon = mechanism
            .map(&2.)
            .map_err(|e| anyhow::anyhow!("OpenDP privacy map failed: {e}"))?;
        if epsilon > 1. / 3. {
            bail!("OpenDP privacy map exceeds the allocated budget");
        }
        for histogram in [&mut h.topics, &mut h.latency, &mut h.tokens] {
            let result = mechanism
                .invoke(&histogram.to_vec())
                .map_err(|e| anyhow::anyhow!("OpenDP release failed: {e}"))?;
            *histogram = result
                .try_into()
                .map_err(|_| anyhow::anyhow!("OpenDP returned unexpected dimensions"))?;
            if histogram.iter().any(|x| !x.is_finite()) {
                bail!("OpenDP returned non-finite output");
            }
        }
        let report = Report {
            schema_version: 1,
            report_id: Uuid::new_v4().to_string(),
            week: week.into(),
            epsilon: 1.,
            histograms: h,
        };
        // Persist exactly one randomized output before releasing it. Retries
        // return the same bytes; crash rollback does not expose an extra output.
        tx.execute(
            "INSERT INTO analytics_reports VALUES(?1,?2,?3,?4,?5)",
            params![
                week,
                report.report_id,
                report.epsilon,
                serde_json::to_string(&report)?,
                now()
            ],
        )?;
        tx.commit()?;
        Ok(report)
    }
}

/// Deliberately labelled heuristic in the UI/docs, not a psychological inference.
pub fn topic(text: &str) -> u8 {
    let text = text.to_lowercase();
    for (index, terms) in [
        (2, ["rust", "code", "python", "debug", "api"].as_slice()),
        (
            3,
            ["write", "écris", "rédig", "email", "article"].as_slice(),
        ),
        (
            4,
            ["research", "source", "analyse", "compare", "study"].as_slice(),
        ),
        (
            5,
            ["plan", "schedule", "agenda", "organis", "travel"].as_slice(),
        ),
        (
            6,
            ["learn", "explain", "apprend", "explique", "teach"].as_slice(),
        ),
        (
            7,
            ["business", "startup", "client", "revenue", "vente"].as_slice(),
        ),
    ] {
        if terms.iter().any(|word| text.contains(word)) {
            return index;
        }
    }
    1
}
pub fn latency_bucket(ms: Option<u128>) -> u8 {
    match ms {
        None => 1,
        Some(x) => match x {
            0..=249 => 2,
            250..=999 => 3,
            1000..=2999 => 4,
            3000..=9999 => 5,
            10000..=29999 => 6,
            _ => 7,
        },
    }
}
pub fn token_bucket(tokens: Option<u64>) -> u8 {
    match tokens {
        None => 1,
        Some(x) => match x {
            0..=127 => 2,
            128..=511 => 3,
            512..=2047 => 4,
            2048..=8191 => 5,
            8192..=32767 => 6,
            _ => 7,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixed_reports_retry_and_budget_survive_reopen() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("v.db");
        let mut v = Vault::open(&path, &[1; 32]).unwrap();
        assert!(v.prepare_report("2026-W01", false, true).is_err());
        v.set_consent(true).unwrap();
        let one = v.prepare_report("2026-W01", false, true).unwrap();
        assert_eq!(one, v.prepare_report("2026-W01", false, true).unwrap());
        drop(v);
        let mut v = Vault::open(&path, &[1; 32]).unwrap();
        assert_eq!(one, v.prepare_report("2026-W01", false, true).unwrap());
        for week in ["2026-W02", "2026-W03", "2026-W04"] {
            v.prepare_report(week, false, true).unwrap();
        }
        assert!(v.prepare_report("2026-W05", false, true).is_err());
        assert!(one.histograms.topics.iter().all(|x| x.is_finite()));
        v.set_consent(false).unwrap();
        assert!(v.prepare_report("2026-W01", false, true).is_err());
    }
    #[test]
    fn schemas_reject_extra_raw_fields() {
        let data = serde_json::json!({"schema_version":1,"report_id":"x","week":"2026-W01","epsilon":1.,"histograms":{"topics":vec![0.;8],"latency":vec![0.;8],"tokens":vec![0.;8]},"prompt":"secret"});
        assert!(serde_json::from_value::<Report>(data).is_err());
    }
    #[test]
    fn week_validation() {
        assert!(validate_week("2026-W01").is_ok());
        assert!(validate_week("2026-W99").is_err());
        assert!(validate_week("today").is_err());
        assert!(validate_week("+026-W01").is_err());
        assert!(validate_week("2026-W+1").is_err());
    }

    #[test]
    fn persisted_reports_remain_retryable_after_week_rollover() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let mut vault = Vault::open(&path, &[9; 32]).unwrap();
        vault.set_consent(true).unwrap();
        let previous = (Utc::now() - chrono::Duration::weeks(1)).iso_week();
        let week = format!("{}-W{:02}", previous.year(), previous.week());
        // A simulation fixture supplies the report that a preceding week's
        // production run would have prepared, without changing the OS clock.
        let report = vault.prepare_report(&week, false, true).unwrap();
        drop(vault);
        let mut vault = Vault::open(&path, &[9; 32]).unwrap();
        assert_eq!(report, vault.prepare_report(&week, false, false).unwrap());
        assert_eq!(vault.analytics_stats(false).unwrap()["budget_used"], 1.);
        let older = (Utc::now() - chrono::Duration::weeks(2)).iso_week();
        let missing = format!("{}-W{:02}", older.year(), older.week());
        assert!(vault.prepare_report(&missing, false, false).is_err());
        vault.set_consent(false).unwrap();
        assert!(vault.prepare_report(&week, false, false).is_err());
    }
}
