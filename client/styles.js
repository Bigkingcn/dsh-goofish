// 面板样式。只用主题令牌（--dsw-alias-*），不写字面色值，
// 这样明暗主题切换、品牌色调整都由 DSH 负责。
const CSS = `
.gf-root{display:flex;flex-direction:column;height:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px}
.gf-tabs{display:flex;gap:4px;padding:10px 14px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gf-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 12px;border-radius:8px 8px 0 0;cursor:pointer;font:inherit}
.gf-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gf-tab[data-active="true"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
.gf-body{flex:1;overflow:auto;padding:14px}
.gf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gf-row-between{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.gf-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px;margin-bottom:12px}
.gf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.gf-kv{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px}
.gf-kv dt{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-bottom:4px}
.gf-kv dd{margin:0;font-size:16px;font-variant-numeric:tabular-nums}
.gf-muted{color:var(--dsw-alias-label-tertiary)}
.gf-small{font-size:11px}
.gf-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:11px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.gf-badge[data-tone="ok"]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.gf-badge[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.gf-badge[data-tone="error"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.gf-badge[data-tone="brand"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.gf-btn{appearance:none;font:inherit;cursor:pointer;padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.gf-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.gf-btn:disabled{opacity:.5;cursor:not-allowed}
.gf-btn[data-tone="primary"]{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.gf-btn[data-tone="danger"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.gf-table{width:100%;border-collapse:collapse}
.gf-table th,.gf-table td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top}
.gf-table th{color:var(--dsw-alias-label-tertiary);font-weight:500;font-size:11px;white-space:nowrap}
.gf-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}
.gf-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.gf-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.gf-link:hover{text-decoration:underline}
.gf-input,.gf-select,.gf-textarea{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;min-width:0}
.gf-textarea{width:100%;min-height:96px;resize:vertical;font-family:ui-monospace,monospace;font-size:12px}
.gf-field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.gf-field>label{color:var(--dsw-alias-label-secondary);font-size:11px}
.gf-notice{border-radius:8px;padding:8px 10px;margin-bottom:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.gf-notice[data-tone="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.gf-notice[data-tone="warn"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.gf-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1);display:flex;align-items:center;justify-content:center;z-index:40}
.gf-modal{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;width:min(560px,92vw);max-height:86vh;overflow:auto;box-shadow:0 12px 40px var(--dsw-alias-bg-mask-2)}
.gf-modal h3{margin:0 0 10px;font-size:14px}
.gf-pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);max-height:280px;overflow:auto;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px}
.gf-untrusted{color:var(--dsw-alias-label-tertiary);font-size:11px}
.gf-truncate{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

module.exports = { CSS }

