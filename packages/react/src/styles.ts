/** Scoped styles for QoreConnect UI (light and dark via prefers-color-scheme; override the --qc-* tokens to theme). */
export const STYLES = `
.qc-root{--qc-bg:#ffffff;--qc-fg:#0b0f14;--qc-muted:#5b6672;--qc-line:#e3e7ec;--qc-accent:#0f7a5c;--qc-accent-fg:#ffffff;
--qc-ok:#0f7a5c;--qc-ok-bg:#e3f5ee;--qc-warn:#8a5a00;--qc-warn-bg:#fff3d6;--qc-bad:#b42318;--qc-bad-bg:#fde7e5;--qc-backdrop:rgba(11,15,20,.55);
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--qc-fg)}
@media (prefers-color-scheme:dark){.qc-root:not([data-theme="light"]){--qc-bg:#0f141b;--qc-fg:#e8edf2;--qc-muted:#93a1b0;--qc-line:#1f2a36;
--qc-accent:#7cf2c4;--qc-accent-fg:#06281d;--qc-ok:#7cf2c4;--qc-ok-bg:#0f2e24;--qc-warn:#ffcc66;--qc-warn-bg:#33270b;--qc-bad:#ff8a80;--qc-bad-bg:#3a1513;--qc-backdrop:rgba(0,0,0,.7)}}
.qc-root[data-theme="dark"]{--qc-bg:#0f141b;--qc-fg:#e8edf2;--qc-muted:#93a1b0;--qc-line:#1f2a36;--qc-accent:#7cf2c4;--qc-accent-fg:#06281d;
--qc-ok:#7cf2c4;--qc-ok-bg:#0f2e24;--qc-warn:#ffcc66;--qc-warn-bg:#33270b;--qc-bad:#ff8a80;--qc-bad-bg:#3a1513;--qc-backdrop:rgba(0,0,0,.7)}
.qc-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--qc-backdrop)}
.qc-dialog{box-sizing:border-box;width:100%;max-width:460px;max-height:calc(100vh - 32px);overflow:auto;background:var(--qc-bg);color:var(--qc-fg);
border:1px solid var(--qc-line);border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14px;line-height:1.45}
.qc-eyebrow{margin:0;color:var(--qc-muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.qc-title{margin:4px 0 8px;font-size:20px;font-weight:650}
.qc-summary{margin:8px 0 0}
.qc-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}
.qc-ok{color:var(--qc-ok);background:var(--qc-ok-bg)}.qc-warn{color:var(--qc-warn);background:var(--qc-warn-bg)}.qc-bad{color:var(--qc-bad);background:var(--qc-bad-bg)}
.qc-rows{margin:16px 0;display:grid;gap:8px}.qc-rows>div{display:grid;grid-template-columns:96px 1fr;gap:8px}
.qc-rows dt{color:var(--qc-muted)}.qc-rows dd{margin:0;min-width:0}
.qc-rows a{color:var(--qc-accent)}
.qc-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}.qc-break{word-break:break-all}
.qc-muted{color:var(--qc-muted)}
.qc-args{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.qc-checks{border-top:1px solid var(--qc-line);padding-top:12px}.qc-checks ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.qc-checks li{display:flex;gap:8px;align-items:flex-start}.qc-mark{font-weight:700;width:14px;flex:none}
.qc-pass .qc-mark{color:var(--qc-ok)}.qc-fail .qc-mark{color:var(--qc-bad)}.qc-warnrow .qc-mark{color:var(--qc-warn)}
.qc-help{margin:12px 0 0;color:var(--qc-muted);font-size:13px}
.qc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.qc-btn{font:inherit;font-weight:600;border-radius:10px;padding:10px 16px;cursor:pointer;border:1px solid var(--qc-line)}
.qc-btn:focus-visible{outline:3px solid var(--qc-accent);outline-offset:2px}
.qc-primary{background:var(--qc-accent);color:var(--qc-accent-fg);border-color:var(--qc-accent)}
.qc-secondary{background:transparent;color:var(--qc-fg)}
.qc-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:420px){.qc-rows>div{grid-template-columns:1fr}.qc-actions{flex-direction:column-reverse}.qc-btn{width:100%}}
@media (prefers-reduced-motion:no-preference){.qc-dialog{animation:qc-in .14s ease-out}}@keyframes qc-in{from{transform:translateY(6px);opacity:0}}
`
