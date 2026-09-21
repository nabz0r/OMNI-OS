use crate::{Error, Result};

pub(crate) const MAX_EXPORT_BYTES: usize = 2 * 1024 * 1024;

/// The only writable payloads are owner-requested metadata exports.
pub(crate) fn validate_export(name: &str, contents: &str, mime: &str) -> Result<()> {
    let valid_name = name.starts_with("omni-")
        && name.len() <= 120
        && !name.contains("..")
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte));
    let valid_type = (name.ends_with(".json") && mime == "application/json")
        || (name.ends_with(".csv") && mime == "text/csv");
    if !valid_name || !valid_type || contents.len() > MAX_EXPORT_BYTES {
        return Err(Error::InvalidExport);
    }
    Ok(())
}

#[cfg(desktop)]
pub(crate) fn save_to_directory(
    directory: &std::path::Path,
    name: &str,
    contents: &str,
    mime: &str,
) -> Result<String> {
    use std::io::Write;
    validate_export(name, contents, mime)?;
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(directory)
        .map_err(|_| Error::ExportUnavailable)?;
    let (stem, extension) = name.rsplit_once('.').ok_or(Error::InvalidExport)?;
    // Exclusive creation preserves earlier exports and refuses existing symlinks.
    for suffix in 0..1000 {
        let basename = if suffix == 0 {
            name.to_owned()
        } else {
            format!("{stem}-{suffix}.{extension}")
        };
        let path = directory.join(basename);
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = match options.open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(Error::ExportUnavailable),
        };
        if file
            .write_all(contents.as_bytes())
            .and_then(|_| file.sync_all())
            .is_err()
        {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(Error::ExportUnavailable);
        }
        return Ok(format!("Saved to {}", path.display()));
    }
    Err(Error::ExportUnavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_rejects_paths_extensions_and_mime_mismatch() {
        for name in [
            "../omni-history.json",
            "/tmp/omni-history.json",
            "omni-../history.json",
            "omni-..json",
            "omni-history.json:other",
            "omni-history.exe",
            "omni-history\\file.json",
            "other-history.json",
            "omni-history.JSON",
        ] {
            assert_eq!(
                validate_export(name, "{}", "application/json"),
                Err(Error::InvalidExport)
            );
        }
        assert_eq!(
            validate_export("omni-history.csv", "a,b", "application/json"),
            Err(Error::InvalidExport)
        );
        assert!(validate_export("omni-history-2026-09-21.json", "{}", "application/json").is_ok());
        assert!(validate_export("omni-history.csv", "a,b", "text/csv").is_ok());
    }

    #[test]
    fn export_limit_counts_utf8_bytes() {
        assert!(validate_export(
            "omni-history.json",
            &"x".repeat(MAX_EXPORT_BYTES),
            "application/json"
        )
        .is_ok());
        assert_eq!(
            validate_export(
                "omni-history.json",
                &"é".repeat(MAX_EXPORT_BYTES / 2 + 1),
                "application/json"
            ),
            Err(Error::InvalidExport)
        );
    }

    #[cfg(desktop)]
    #[test]
    fn repeated_exports_never_replace_existing_files() {
        let directory = tempfile::tempdir().unwrap();
        let first = save_to_directory(
            directory.path(),
            "omni-history.json",
            "{\"first\":true}",
            "application/json",
        )
        .unwrap();
        let second = save_to_directory(
            directory.path(),
            "omni-history.json",
            "{\"second\":true}",
            "application/json",
        )
        .unwrap();
        assert_ne!(first, second);
        assert_eq!(
            std::fs::read_to_string(directory.path().join("omni-history.json")).unwrap(),
            "{\"first\":true}"
        );
        assert_eq!(
            std::fs::read_to_string(directory.path().join("omni-history-1.json")).unwrap(),
            "{\"second\":true}"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(directory.path().join("omni-history.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }
}
