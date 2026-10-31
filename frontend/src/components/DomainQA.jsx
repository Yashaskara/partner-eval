import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { DOMAINS, PRIORITY_WORD } from '../domains.js';
import { useToast } from './Toast.jsx';

export default function DomainQA({ domain, onComplete, onClose }) {
  const toast = useToast();
  const domainInfo = DOMAINS.find(d => d.key === domain);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [selectedOptions, setSelectedOptions] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [priority, setPriority] = useState(null);
  const [priorityReasoning, setPriorityReasoning] = useState('');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => { loadQuestions(); }, [domain]);

  async function loadQuestions() {
    setLoading(true);
    try {
      const data = await api.profileQA.getQuestions(domain);
      setQuestions(data.questions);
      setAnswers(data.answers || {});
      const firstUnanswered = data.questions.findIndex(q => !data.answers[q.id]);
      setCurrentIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function handleSelect(optionIdx) {
    setSelectedOptions(prev => {
      const next = new Set(prev);
      if (next.has(optionIdx)) next.delete(optionIdx);
      else next.add(optionIdx);
      return next;
    });
  }

  async function handleNext() {
    const q = questions[currentIdx];
    const indices = effectiveSelection;
    if (indices.length === 0) return;

    const texts = indices.map(i => q.options[i]);
    const trimmedFreeText = freeText.trim();

    setAnswers(prev => ({
      ...prev,
      [q.id]: { selected_option_indices: indices, selected_option_texts: texts, free_text: trimmedFreeText },
    }));

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelectedOptions(new Set());
      setFreeText('');
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    api.profileQA.submitAnswer({
      questionId: q.id,
      selectedOptionIndices: indices,
      selectedOptionTexts: texts,
      freeText: trimmedFreeText,
    }).catch(e => console.error('Failed to save answer:', e));

    if (currentIdx >= questions.length - 1) {
      await handleSummarize();
    }
  }

  async function handleSummarize() {
    setSummarizing(true);
    try {
      const result = await api.profileQA.summarize(domain);
      setSummary(result.summary);
      setPriority(result.priority);
      setPriorityReasoning(result.priority_reasoning);
    } catch (e) {
      console.error(e);
      toast('Failed to generate summary: ' + e.message);
    }
    setSummarizing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.profileQA.saveSummary(domain, { summary, priority });
      onComplete();
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="dialog-backdrop" onClick={onClose}>
        <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: 'min(620px, 95vw)' }}>
          <div style={{ padding: 40, textAlign: 'center' }}>Loading questions...</div>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  const existingAnswer = answers[q?.id];
  const existingIndices = existingAnswer?.selected_option_indices || [];
  const effectiveSelection = selectedOptions.size > 0 ? [...selectedOptions] : existingIndices;
  const isSelected = (i) => selectedOptions.size > 0 ? selectedOptions.has(i) : existingIndices.includes(i);
  const effectiveFreeText = freeText || (selectedOptions.size === 0 ? existingAnswer?.free_text || '' : freeText);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        onClick={e => e.stopPropagation()}
        ref={containerRef}
        style={{ width: 'min(640px, 95vw)', height: 'min(700px, 88vh)', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--color-divider)', flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 4 }}>Profile setup</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 22 }}>{domainInfo.label}</div>
            </div>
            <div className="num" style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {currentIdx + 1} / {questions.length}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: 'var(--color-divider)', borderRadius: 2, marginTop: 12 }}>
            <div style={{ height: '100%', width: `${((currentIdx + (effectiveSelection.length > 0 ? 1 : 0)) / questions.length) * 100}%`, background: 'var(--color-accent)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 22px' }}>
          {summarizing ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20, marginBottom: 10 }}>Analyzing your answers...</div>
              <p className="text-muted" style={{ fontSize: 14 }}>Building your {domainInfo.label.toLowerCase()} profile from your responses.</p>
            </div>
          ) : summary ? (
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20, marginBottom: 16 }}>Your {domainInfo.label} profile</div>

              <div style={{ border: '1px solid var(--color-accent-300)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', background: 'var(--color-accent-100)', marginBottom: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 8, fontWeight: 600 }}>Summary</div>
                <textarea
                  className="input"
                  rows={4}
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  style={{ background: 'transparent', border: '1px solid var(--color-accent-300)', fontSize: 14, lineHeight: 1.7 }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginBottom: 8 }}>Inferred priority</div>
                <div className="seg" style={{ marginBottom: 8 }}>
                  {[1, 2, 3].map(p => (
                    <button key={p} className={`seg-opt${priority === p ? ' active' : ''}`} onClick={() => setPriority(p)}>
                      {p} — {PRIORITY_WORD[p]}
                    </button>
                  ))}
                </div>
                {priorityReasoning && (
                  <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>{priorityReasoning}</p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Discard</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save to profile'}</button>
              </div>
            </div>
          ) : q ? (
            <div>
              {/* Layer badge */}
              <span className="tag tag-neutral" style={{ fontSize: 10, marginBottom: 14, display: 'inline-block' }}>
                {q.layer === 'stance' ? 'Your stance' : q.layer === 'scenario' ? 'Scenario' : q.layer === 'tradeoff' ? 'Tradeoff' : 'Reflection'}
              </span>

              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20, lineHeight: 1.3, marginBottom: 20 }}>
                {q.question_text}
              </div>

              {/* Options */}
              <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 8 }}>Select all that apply</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {(q.options || []).map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected(i) ? '1.5px solid var(--color-accent)' : '1px solid var(--color-divider)',
                      background: isSelected(i) ? 'var(--color-accent-100)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1.5,
                      fontFamily: 'inherit',
                      color: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: isSelected(i) ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-neutral-400)',
                      background: isSelected(i) ? 'var(--color-accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                    }}>
                      {isSelected(i) ? '✓' : ''}
                    </span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>

              {/* Free text */}
              <div className="field">
                <label>Anything to add? (optional)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={effectiveFreeText}
                  onChange={e => setFreeText(e.target.value)}
                  placeholder="Elaborate or add context..."
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {!summary && !summarizing && (
          <div style={{ padding: '12px 22px 18px', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 'none' }}>
            <button
              className="btn btn-secondary"
              disabled={currentIdx === 0}
              onClick={() => { setCurrentIdx(currentIdx - 1); setSelectedOptions(new Set()); setFreeText(''); }}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={effectiveSelection.length === 0}
              onClick={handleNext}
            >
              {currentIdx === questions.length - 1 ? 'Finish & summarize' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
