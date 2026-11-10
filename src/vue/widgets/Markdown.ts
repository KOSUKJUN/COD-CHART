import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import { parseMarkdown, type BlockToken, type InlineToken } from '../../core/sanitize';

/**
 * Renders the restricted-markdown token tree with h(). No innerHTML / v-html:
 * every string becomes a text node, so markup in the source can never execute.
 */
function inline(tokens: InlineToken[]): VNodeChild[] {
  return tokens.map((t) => {
    switch (t.t) {
      case 'text': return t.v;
      case 'strong': return h('strong', inline(t.c));
      case 'em': return h('em', inline(t.c));
      case 'code': return h('code', t.v);
      case 'link': return h('a', { href: t.href, target: '_blank', rel: 'noopener noreferrer nofollow' }, inline(t.c));
    }
  });
}

function block(b: BlockToken, i: number): VNodeChild {
  switch (b.t) {
    case 'h': return h(`h${b.level + 2}`, { key: i }, inline(b.c)); // h3–h5 inside a card
    case 'p': return h('p', { key: i }, inline(b.c));
    case 'ul': case 'ol': return h(b.t, { key: i }, b.items.map((it, j) => h('li', { key: j }, inline(it))));
    case 'quote': return h('blockquote', { key: i }, inline(b.c));
    case 'pre': return h('pre', { key: i }, h('code', b.v));
    case 'hr': return h('hr', { key: i });
  }
}

export default defineComponent({
  name: 'CvMarkdown',
  props: { source: { type: String as PropType<string>, default: '' } },
  setup(props) {
    return () => h('div', { class: 'cv-md' }, parseMarkdown(props.source).map(block));
  },
});
