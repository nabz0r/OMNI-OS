export interface TextAttachment {
  name: string;
  media_type: string;
  text: string;
}
export const textFileTypes: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  log: "text/plain",
  yaml: "application/yaml",
  yml: "application/yaml",
};
export async function readTextFiles(
  files: FileList | File[],
): Promise<TextAttachment[]> {
  if (files.length > 8)
    throw new Error(
      "Attach at most eight files. Your policy may set a lower limit.",
    );
  return Promise.all(
    Array.from(files).map(async (file) => {
      const extension = file.name.split(".").at(-1)?.toLowerCase() || "";
      if (!textFileTypes[extension])
        throw new Error(
          "Use an inspectable text file: TXT, MD, CSV, JSON, LOG, YAML or YML. Binary files are not supported.",
        );
      if (file.size > 100000)
        throw new Error(
          "Each file must be at most 100,000 bytes. Your policy may set a lower limit.",
        );
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
      } catch {
        throw new Error("Files must contain valid UTF-8 text.");
      }
      return { name: file.name, media_type: textFileTypes[extension], text };
    }),
  );
}
