import React from 'react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import './CodeBlockComponent.css';

export default function CodeBlockComponent({ node: { attrs: { language: defaultLanguage } }, updateAttributes, extension }: any) {
  return (
    <NodeViewWrapper className="custom-code-block">
      <select
        contentEditable={false}
        defaultValue={defaultLanguage || 'null'}
        onChange={event => updateAttributes({ language: event.target.value })}
        className="code-block-select"
      >
        <option value="null">auto</option>
        <option disabled>—</option>
        {extension.options.lowlight.listLanguages().map((lang: string, index: number) => (
          <option key={index} value={lang}>
            {lang}
          </option>
        ))}
      </select>
      <pre>
        {/* @ts-ignore */}
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
