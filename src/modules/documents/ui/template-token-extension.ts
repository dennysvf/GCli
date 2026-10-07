import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Shows the variables of a template body as tokens (design system 5.13): the text `{{paciente.nome}}`
// stays plain text in the document, so what is stored is what the server validates, and only its
// look changes.
const TOKEN = /\{\{[^{}\s]+\}\}/g;

export const TemplateTokenHighlight = Extension.create({
  name: "templateTokenHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("templateTokenHighlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, position) => {
              if (!node.isText || !node.text) return;
              for (const match of node.text.matchAll(TOKEN)) {
                const from = position + (match.index ?? 0);
                decorations.push(
                  Decoration.inline(from, from + match[0].length, { class: "template-token" }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
