// User-supplied @begin environments, loaded via:
//   Load environments: warning, theorem from file-env-defs.js
// Each export is a handler of the same shape registerBlockEnvironment takes.

export const warning = {
	html:  (ctx) => `<aside class="warning"><strong>${ctx.text ?? ''}</strong>${ctx.inner}</aside>`,
	latex: (ctx) => `\\begin{warning}[${ctx.text ?? ''}]\n${ctx.inner}\n\\end{warning}\n\n`,
};

export const theorem = {
	html:  (ctx) => `<div class="theorem">${ctx.inner}</div>`,
	latex: (ctx) => `\\begin{theorem}\n${ctx.inner}\n\\end{theorem}\n\n`,
};
