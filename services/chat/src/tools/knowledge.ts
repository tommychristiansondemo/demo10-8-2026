/**
 * Retrieval over the Bedrock Knowledge Base (S3 Vectors). Metadata filters narrow to a model and/or document type;
 * every passage is registered as a citation the model references as [S#] and the UI renders as a source chip.
 */
import { RetrieveCommand, type RetrievalFilter } from '@aws-sdk/client-bedrock-agent-runtime';
import { agentRuntime } from '../clients.js';
import { canonicalModel } from './models.js';

export interface Citation { id: string; title: string; url?: string; page?: number; snippet: string; docType?: string }

export class CitationRegistry {
  private items: Citation[] = [];
  add(c: Omit<Citation, 'id'>): Citation {
    const existing = this.items.find((x) => x.url === c.url && x.page === c.page && x.title === c.title); // one citation per page
    if (existing) return existing;
    const item = { ...c, id: `S${this.items.length + 1}` };
    this.items.push(item);
    return item;
  }
  all() { return this.items; }
}

const DOC_TITLES: Record<string, string> = {
  owner_manual: "Owner's Manual",
  warranty_booklet: 'Warranty Information Booklet',
  nhtsa_digest: 'NHTSA recalls & complaints digest',
  guide: 'Owner guide',
  maintenance_schedule: 'Maintenance schedule',
};

export interface KnowledgeInput { query: string; model?: string; year?: number; doc_type?: string }

export async function searchKnowledge(input: KnowledgeInput, registry: CitationRegistry) {
  const filters: RetrievalFilter[] = [];
  if (input.model) {
    const m = canonicalModel(input.model);
    filters.push({ orAll: [{ equals: { key: 'model', value: m } }, { equals: { key: 'model', value: 'all' } }] });
  }
  if (input.doc_type) filters.push({ equals: { key: 'doc_type', value: input.doc_type } });
  const filter: RetrievalFilter | undefined = filters.length > 1 ? { andAll: filters } : filters[0];
  const query = [input.query, input.year ? `(model year ${input.year})` : ''].join(' ').trim();

  const res = await agentRuntime.send(new RetrieveCommand({
    knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID!,
    retrievalQuery: { text: query.slice(0, 1000) },
    retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 8, ...(filter ? { filter } : {}) } },
  }));

  const passages = (res.retrievalResults || []).map((r) => {
    const md = (r.metadata || {}) as Record<string, any>;
    const page = md['x-amz-bedrock-kb-document-page-number'] != null ? Number(md['x-amz-bedrock-kb-document-page-number']) : undefined;
    const docType = String(md.doc_type || 'guide');
    const baseTitle = md.title || [md.year, md.model && md.model !== 'all' ? `Nissan ${String(md.model).replace(/\b\w/g, (c: string) => c.toUpperCase())}` : '', DOC_TITLES[docType] || 'Document'].filter(Boolean).join(' ');
    const url = md.source_url ? `${md.source_url}${page && String(md.source_url).endsWith('.pdf') ? `#page=${page}` : ''}` : undefined;
    const text = (r.content?.text || '').replace(/\s+/g, ' ').trim();
    const cite = registry.add({ title: page ? `${baseTitle}, p. ${page}` : baseTitle, url, page, snippet: text.slice(0, 280), docType });
    return { cite_id: cite.id, source: cite.title, doc_type: docType, model_year: md.year, relevance: r.score != null ? Number(r.score.toFixed(3)) : undefined, text: text.slice(0, 1800) };
  });

  return {
    query,
    filter_applied: filter ? { model: input.model, doc_type: input.doc_type } : 'none',
    passages,
    instructions: passages.length
      ? 'Cite passages you rely on with their cite_id in square brackets, e.g. [S2]. If passages are for a different model year than asked, say so.'
      : 'No passages found. Try a broader query or no model filter; do not invent facts.',
  };
}
