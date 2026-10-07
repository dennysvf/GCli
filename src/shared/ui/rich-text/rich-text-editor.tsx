"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/components/button";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { cn } from "@/shared/ui/utils";

// The rich text editor of clinical notes (PRD F07) and document templates (PRD F08): bold, italic,
// lists, headings. Tiptap is limited to the formatting the server accepts (ADR-032): everything
// else is switched off, so what the editor can produce is what the sanitizer keeps.
export type RichTextEditorProps = {
  initialHtml: string;
  label: string;
  maxCharacters: number;
  onChange: (html: string, text: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  className?: string;
  // Extra toolbar content, such as the variable menu of the template editor (F08).
  toolbarExtra?: (editor: Editor) => ReactNode;
  // Gives the owner a handle on the editor, to insert text at the cursor.
  onReady?: (editor: Editor) => void;
};

export function RichTextEditor({
  initialHtml,
  label,
  maxCharacters,
  onChange,
  onBlur,
  autoFocus,
  className,
  toolbarExtra,
  onReady,
}: RichTextEditorProps) {
  const t = useTranslations("common.richText");
  const format = useFormatters();
  const editor = useEditor({
    // The server renders the page first; Tiptap must wait for the browser.
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    content: initialHtml,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        strike: false,
        underline: false,
      }),
    ],
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: "note-prose min-h-48 px-3 py-2 outline-none",
      },
    },
    onCreate: ({ editor: created }) => onReady?.(created),
    onUpdate: ({ editor: current }) => onChange(current.getHTML(), current.getText()),
    onBlur: () => onBlur?.(),
  });

  const characters = editor ? Array.from(editor.getText()).length : 0;
  const tools = editor
    ? [
        {
          key: "bold",
          label: t("bold"),
          active: editor.isActive("bold"),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          key: "italic",
          label: t("italic"),
          active: editor.isActive("italic"),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          key: "h2",
          label: t("heading"),
          active: editor.isActive("heading", { level: 2 }),
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          key: "h3",
          label: t("subheading"),
          active: editor.isActive("heading", { level: 3 }),
          run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        },
        {
          key: "ul",
          label: t("bulletList"),
          active: editor.isActive("bulletList"),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          key: "ol",
          label: t("orderedList"),
          active: editor.isActive("orderedList"),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
      ]
    : [];

  return (
    <div className={cn("border-input bg-card rounded-md border", className)}>
      <div role="toolbar" aria-label={t("toolbar")} className="bg-paper-1 flex flex-wrap gap-1 border-b p-1">
        {tools.map((tool) => (
          <Button
            key={tool.key}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={tool.active}
            className={cn(tool.active && "bg-accent")}
            // The editor keeps the focus, so typing right after a click is never lost.
            onMouseDown={(event) => event.preventDefault()}
            onClick={tool.run}
          >
            {tool.label}
          </Button>
        ))}
        {editor && toolbarExtra ? toolbarExtra(editor) : null}
      </div>
      <EditorContent editor={editor} />
      <p
        className={cn(
          "text-muted-foreground border-t px-3 py-1 text-xs",
          characters >= maxCharacters && "text-danger",
          characters >= maxCharacters * 0.9 && characters < maxCharacters && "text-warning",
        )}
      >
        {t("characterCount", {
          count: format.number(characters),
          max: format.number(maxCharacters),
        })}
      </p>
    </div>
  );
}
