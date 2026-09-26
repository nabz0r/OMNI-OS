// Keep this entry independent of React and application imports so a failed chunk
// has a visible, usable recovery screen instead of an empty root element.
const startup = document.getElementById("omni-startup")!;
const heading = document.getElementById("omni-startup-heading")!;
const detail = document.getElementById("omni-startup-detail")!;
const retry = document.getElementById("omni-startup-retry")!;
let visible = false;
const recover = () => {
  if (visible) return;
  heading.textContent = "OMNI could not finish opening.";
  detail.textContent =
    "Reload to try again. Your saved memories and permissions have not been reset.";
  retry.hidden = false;
};
const deadline = window.setTimeout(recover, 25_000);
retry.addEventListener("click", () => window.location.reload());
window.addEventListener("omni:interface-visible", () => {
  visible = true;
  clearTimeout(deadline);
  startup.hidden = true;
});
void import("./main").catch(recover);
