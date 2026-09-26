import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { recallStatus } from '../data/demo';
import { Zap, Puzzle, PartyPopper, Target, Brain, Check, X as XIcon, RefreshCw } from '../components/Icon';

type QuestionType = 'abstract' | 'explain' | 'counterfactual' | 'transfer';
type ReviewMode = 'abstract' | 'understand';
type SelfRating = 'again' | 'almost' | 'got';

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return vw;
}

const QUESTIONS: Record<string, {
  type: QuestionType;
  question: string;
  cloze?: { before: string; blank: string; after: string };
  options?: string[];
  correctIndex?: number;
  explanation: string;
}[]> = {
  hoisting: [
    {
      type: 'explain',
      question: 'Explain how JavaScript hoisting works from creation phase to execution phase. Include what happens to var, let/const, and function declarations.',
      explanation: 'During the creation phase, the JS engine allocates memory for all var declarations (set to undefined) and function declarations (set to their full definition). let/const are hoisted but not initialized — accessing them before their declaration causes a ReferenceError (Temporal Dead Zone). During execution, code runs top-to-bottom using these pre-allocated values.',
    },
    {
      type: 'abstract',
      question: 'Complete the following:',
      cloze: { before: 'var declarations are hoisted and initialized to', blank: 'undefined', after: ', while let/const enter the Temporal Dead Zone.' },
      explanation: 'var is initialized to undefined during hoisting; let/const are hoisted but not initialized, causing a ReferenceError if accessed early.',
    },
    {
      type: 'counterfactual',
      question: 'What would change if JavaScript used only let/const and removed var entirely?',
      options: [
        'Nothing would change — hoisting still works the same way',
        'All variable declarations would enter the TDZ, eliminating silent undefined-before-assignment bugs',
        'Variables would no longer be hoisted at all',
        'Function declarations would no longer be callable before their declaration line',
      ],
      correctIndex: 1,
      explanation: 'Without var, all variable declarations would be block-scoped and enter the TDZ, making it a ReferenceError to access them before initialization rather than returning undefined silently.',
    },
    {
      type: 'transfer',
      question: 'You see this code in a codebase:\n\nconsole.log(x);\nvar x = 5;\n\nA colleague says this will throw a ReferenceError. Are they correct? Explain what actually happens.',
      explanation: "They are incorrect. Because var is hoisted and initialized to undefined, console.log(x) outputs undefined — not an error. The assignment x = 5 happens on the line it appears.",
    },
  ],
  scope: [
    {
      type: 'abstract',
      question: 'Complete the following:',
      cloze: { before: 'A variable declared with var inside a function is', blank: 'function-scoped', after: ', while let is block-scoped.' },
      explanation: 'var respects only function boundaries for its scope; let and const respect any block including if, for, and {…} blocks.',
    },
    {
      type: 'explain',
      question: 'What is the difference between lexical scope and dynamic scope? Which does JavaScript use?',
      explanation: 'Lexical scope means a variable\'s scope is determined at write time by where it is declared in the source code. Dynamic scope would mean scope is determined at runtime by the call stack. JavaScript uses lexical scope — functions capture their surrounding scope at definition, not at call time.',
    },
  ],
  tdz: [
    {
      type: 'explain',
      question: 'What is the Temporal Dead Zone (TDZ)? When does it start and when does it end for a let declaration?',
      explanation: 'The TDZ is the period between the start of a block scope and the let/const declaration. During this period, the variable exists in the scope (it is hoisted) but is not initialized — accessing it throws a ReferenceError. The TDZ ends when execution reaches the declaration line and the variable is initialized.',
    },
    {
      type: 'counterfactual',
      question: 'If let behaved like var (initialized to undefined on hoist), what category of bugs would become harder to detect?',
      options: [
        'Infinite loops caused by loop variable reuse',
        'Accessing a variable before assignment, silently getting undefined instead of an error',
        'Memory leaks from unclosed closures',
        'Type coercion errors in arithmetic',
      ],
      correctIndex: 1,
      explanation: 'The TDZ exists precisely to surface use-before-initialization as an explicit ReferenceError. Without it, code accessing let before its declaration would silently get undefined — the same class of subtle bug that var is notorious for.',
    },
  ],
  var: [
    {
      type: 'abstract',
      question: 'Complete the following:',
      cloze: { before: 'Unlike let and const, var is scoped to the nearest enclosing', blank: 'function', after: 'rather than the nearest block.' },
      explanation: 'var ignores block boundaries like if-blocks and for-loops; it only respects function scope. This means a var declared inside a for loop leaks out to the enclosing function.',
    },
    {
      type: 'transfer',
      question: 'Consider:\n\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}\n\nWhat does this print, and why?',
      explanation: 'It prints 3, 3, 3. Because var is function-scoped, all three closures capture the same i variable. By the time the callbacks run, the loop has finished and i === 3. With let, each iteration gets its own block-scoped i, printing 0, 1, 2.',
    },
  ],
};

const QUEUE = [
  { nodeId: 'hoisting', label: 'Hoisting', recall: 42, subject: 'JavaScript' },
  { nodeId: 'tdz', label: 'TDZ', recall: 37, subject: 'JavaScript' },
  { nodeId: 'scope', label: 'Scope', recall: 64, subject: 'JavaScript' },
  { nodeId: 'var', label: 'var', recall: 58, subject: 'JavaScript' },
];

const ratingConfig = {
  again: { label: "Didn't get it", color: 'var(--red)', bg: 'rgba(255,75,75,0.1)', delta: -5 },
  almost: { label: 'Almost', color: 'var(--orange)', bg: 'rgba(255,150,0,0.1)', delta: 8 },
  got: { label: 'Got it', color: 'var(--green)', bg: 'rgba(88,204,2,0.1)', delta: 18 },
};

export default function RetestPage() {
  const { nodes } = useApp();
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;

  const [mode, setMode] = useState<ReviewMode | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [clozeAnswer, setClozeAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [selfRated, setSelfRated] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<{ label: string; before: number; after: number }[]>([]);

  const currentItem = QUEUE[queueIndex];
  const nodeQuestions = QUESTIONS[currentItem?.nodeId] ?? [];
  const questionsForMode = mode === 'abstract'
    ? nodeQuestions.filter(q => q.type === 'abstract').slice(0, 1)
    : nodeQuestions;
  const currentQuestion = questionsForMode[questionIndex];

  if (!mode) {
    return <ModeSelector onSelect={setMode} />;
  }

  if (completed) {
    return <ReviewComplete results={results} onDone={() => navigate('/brain')} />;
  }

  const isFreeText = currentQuestion && !currentQuestion.cloze && !currentQuestion.options;
  const needsSelfRating = submitted && isFreeText && !selfRated;

  const handleSubmit = () => setSubmitted(true);

  const handleRate = (rating: SelfRating) => {
    setSelfRated(true);
    const delta = ratingConfig[rating].delta;
    finishQuestion(delta);
  };

  const handleNextMCQ = () => {
    const isCorrect = selectedOption === currentQuestion.correctIndex;
    finishQuestion(isCorrect ? 15 : -3);
  };

  const handleNextCloze = () => {
    const isCorrect = clozeAnswer.toLowerCase().trim() === currentQuestion.cloze!.blank.toLowerCase();
    finishQuestion(isCorrect ? 12 : 0);
  };

  const finishQuestion = (delta: number) => {
    const nextQ = questionIndex + 1;
    if (nextQ < questionsForMode.length) {
      setQuestionIndex(nextQ);
      setAnswer(''); setSelectedOption(null); setClozeAnswer('');
      setSubmitted(false); setSelfRated(false);
    } else {
      const newResult = {
        label: currentItem.label,
        before: currentItem.recall,
        after: Math.max(0, Math.min(100, currentItem.recall + delta)),
      };
      setResults(prev => [...prev, newResult]);
      const nextNode = queueIndex + 1;
      if (nextNode >= QUEUE.length) {
        setCompleted(true);
      } else {
        setQueueIndex(nextNode);
        setQuestionIndex(0);
        setAnswer(''); setSelectedOption(null); setClozeAnswer('');
        setSubmitted(false); setSelfRated(false);
      }
    }
  };

  if (!currentQuestion) { finishQuestion(0); return null; }

  const node = nodes.find(n => n.id === currentItem.nodeId);
  const rs = recallStatus(node?.recall ?? null);
  const totalQ = QUEUE.reduce((s, item) => s + (QUESTIONS[item.nodeId]?.length ?? 0), 0);
  const doneQ = results.length > 0
    ? QUEUE.slice(0, queueIndex).reduce((s, item) => s + (QUESTIONS[item.nodeId]?.length ?? 0), 0) + questionIndex
    : questionIndex;

  /* ── Mobile layout ── */
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        {/* Mobile top bar */}
        <div style={{
          height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
        }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 5, flex: 1 }}>
            {QUEUE.map((item, i) => {
              const done = i < queueIndex || results.some(r => r.label === item.label);
              const active = i === queueIndex;
              const irs = recallStatus(item.recall);
              return (
                <div key={item.nodeId} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: done ? 'var(--green)' : active ? irs.color : 'var(--bg-input)',
                  border: `1.5px solid ${done ? 'var(--green)' : active ? irs.color : 'var(--border-strong)'}`,
                  transition: 'all 0.2s',
                }} />
              );
            })}
          </div>
          {/* Concept name centered */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {currentItem.label}
          </div>
          {/* Exit button */}
          <button
            onClick={() => navigate('/brain')}
            style={{
              width: 32, height: 32, borderRadius: 8, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* Mobile main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          {/* Question card */}
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '20px 16px', marginBottom: 16,
          }}>
            {/* Type badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 6, marginBottom: 16,
              background: rs.color + '18', border: `1px solid ${rs.color}40`,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: rs.color,
            }}>
              {currentQuestion.type === 'abstract' ? '⚡ Recall'
                : currentQuestion.type === 'explain' ? '💬 Explain'
                : currentQuestion.type === 'counterfactual' ? '🔀 Counterfactual'
                : '🔁 Transfer'}
            </div>

            <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65, margin: '0 0 20px', whiteSpace: 'pre-line', fontWeight: 400 }}>
              {currentQuestion.question}
            </p>

            {/* Cloze */}
            {currentQuestion.cloze && (
              <div style={{ padding: '14px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-2)', lineHeight: 2.2 }}>
                {currentQuestion.cloze.before}{' '}
                <input
                  value={clozeAnswer}
                  onChange={e => setClozeAnswer(e.target.value)}
                  disabled={submitted}
                  onKeyDown={e => e.key === 'Enter' && !submitted && handleSubmit()}
                  placeholder="________"
                  style={{
                    padding: '5px 10px', borderRadius: 7,
                    border: submitted
                      ? clozeAnswer.toLowerCase().trim() === currentQuestion.cloze!.blank.toLowerCase()
                        ? '2px solid var(--green)' : '2px solid var(--red)'
                      : '1.5px solid var(--border-strong)',
                    background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
                    fontFamily: 'inherit', outline: 'none', minWidth: 100,
                  }}
                />
                {', '}{currentQuestion.cloze.after}
              </div>
            )}

            {/* MCQ */}
            {currentQuestion.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentQuestion.options.map((opt, i) => {
                  const isCorrect = i === currentQuestion.correctIndex;
                  const isSelected = selectedOption === i;
                  let bg = 'var(--bg)';
                  let borderColor = 'var(--border)';
                  let textColor = 'var(--text-2)';
                  if (submitted) {
                    if (isCorrect) { bg = 'rgba(88,204,2,0.1)'; borderColor = 'var(--green)'; textColor = 'var(--text)'; }
                    else if (isSelected) { bg = 'rgba(255,75,75,0.08)'; borderColor = 'var(--red)'; }
                  } else if (isSelected) {
                    bg = rs.color + '10'; borderColor = rs.color; textColor = 'var(--text)';
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => !submitted && setSelectedOption(i)}
                      style={{
                        padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                        background: bg, border: `1.5px solid ${borderColor}`,
                        color: textColor, cursor: submitted ? 'default' : 'pointer',
                        fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5,
                        transition: 'all 0.18s', display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        border: `1.5px solid ${submitted && isCorrect ? 'var(--green)' : submitted && isSelected ? 'var(--red)' : isSelected ? rs.color : 'var(--border-strong)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: submitted && isCorrect ? 'rgba(88,204,2,0.2)' : submitted && isSelected ? 'rgba(255,75,75,0.2)' : 'transparent',
                        fontSize: 10, color: submitted && isCorrect ? 'var(--green)' : submitted && isSelected ? 'var(--red)' : 'var(--text-dim)',
                        fontWeight: 700,
                      }}>
                        {submitted && isCorrect ? '✓' : submitted && isSelected && !isCorrect ? '✗' : ['A', 'B', 'C', 'D'][i]}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Free text */}
            {isFreeText && (
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                disabled={submitted}
                placeholder="Write your explanation here..."
                rows={5}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg)', border: '1.5px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.65,
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = rs.color}
                onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
              />
            )}

            {/* Model answer */}
            {submitted && (
              <div style={{
                marginTop: 16, padding: '14px 14px', borderRadius: 10,
                background: 'rgba(88,204,2,0.07)', border: '1px solid rgba(88,204,2,0.25)',
                animation: 'fadeUp 0.3s ease',
              }}>
                <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 8, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Model Answer</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>{currentQuestion.explanation}</div>
              </div>
            )}
          </div>

          {/* Self-rating (free-text only) — mobile: tighter padding */}
          {needsSelfRating && (
            <div style={{ marginBottom: 16, animation: 'fadeUp 0.25s ease' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>How well did you know this?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {(Object.entries(ratingConfig) as [SelfRating, typeof ratingConfig[SelfRating]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => handleRate(key)}
                    style={{
                      padding: '10px 6px', borderRadius: 12,
                      background: cfg.bg, border: `1.5px solid ${cfg.color}50`,
                      color: cfg.color, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                    }}
                  >{cfg.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons — mobile: full width */}
          {!needsSelfRating && (
            <div style={{ display: 'flex', gap: 10 }}>
              {!submitted ? (
                <button
                  onClick={handleSubmit}
                  disabled={currentQuestion.options ? selectedOption === null : currentQuestion.cloze ? !clozeAnswer.trim() : !answer.trim()}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12, background: rs.color,
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15,
                    fontWeight: 700, fontFamily: 'inherit', transition: 'opacity 0.15s',
                    opacity: (currentQuestion.options ? selectedOption === null : currentQuestion.cloze ? !clozeAnswer.trim() : !answer.trim()) ? 0.45 : 1,
                  }}
                >Submit</button>
              ) : !isFreeText ? (
                <button
                  onClick={currentQuestion.cloze ? handleNextCloze : handleNextMCQ}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12, background: 'var(--green)',
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15,
                    fontWeight: 700, fontFamily: 'inherit',
                  }}
                >Next →</button>
              ) : selfRated ? (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '13px 0' }}>Moving on...</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Desktop layout ── */
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>

      {/* ── Left sidebar ── */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column',
        padding: '24px 18px', gap: 20,
      }}>
        {/* Session header */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 4 }}>Review Session</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{mode === 'abstract' ? 'Abstract' : 'Understand'} mode · {QUEUE.length} concepts</div>

          {/* Overall progress bar */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
              <span>Progress</span>
              <span>{results.length}/{QUEUE.length} concepts</span>
            </div>
            <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--green)', width: `${(results.length / QUEUE.length) * 100}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        </div>

        {/* Concept queue */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>Queue</div>
          {QUEUE.map((item, i) => {
            const done = i < queueIndex || results.some(r => r.label === item.label);
            const active = i === queueIndex;
            const irs = recallStatus(item.recall);
            const result = results.find(r => r.label === item.label);
            return (
              <div key={item.nodeId} style={{
                padding: '10px 12px', borderRadius: 10,
                background: active ? 'var(--bg-input)' : 'transparent',
                border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 10,
                opacity: done && !active ? 0.6 : 1,
                transition: 'all 0.2s',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${done ? 'var(--green)' : active ? irs.color : 'var(--border-strong)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'rgba(88,204,2,0.12)' : 'transparent',
                }}>
                  {done
                    ? <Check size={12} strokeWidth={2.5} style={{ color: 'var(--green)' }} />
                    : <span style={{ fontSize: 10, fontWeight: 700, color: active ? irs.color : 'var(--text-dim)' }}>{item.recall}%</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{item.subject}</div>
                </div>
                {result && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: result.after > result.before ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                    {result.after > result.before ? '+' : ''}{result.after - result.before}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Exit */}
        <button
          onClick={() => navigate('/brain')}
          style={{
            padding: '9px', borderRadius: 8, background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
        >
          <XIcon size={14} /> Exit Session
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 48px' }}>
        <div style={{ width: '100%', maxWidth: 760 }}>

          {/* Concept header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              border: `2.5px solid ${rs.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: rs.color + '12', flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: rs.color }}>{currentItem.recall}%</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{currentItem.label}</div>
              <div style={{ fontSize: 12, color: rs.color, fontWeight: 600, marginTop: 2 }}>{rs.label} · {currentItem.subject}</div>
            </div>
            {/* Question counter */}
            <div style={{ display: 'flex', gap: 6 }}>
              {questionsForMode.map((_, i) => (
                <div key={i} style={{
                  width: i === questionIndex ? 20 : 8, height: 8, borderRadius: 4,
                  background: i < questionIndex ? 'var(--green)' : i === questionIndex ? rs.color : 'var(--bg-input)',
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>
          </div>

          {/* Question card */}
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 18, padding: '32px 36px', marginBottom: 20,
          }}>
            {/* Type badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 6, marginBottom: 20,
              background: rs.color + '18', border: `1px solid ${rs.color}40`,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: rs.color,
            }}>
              {currentQuestion.type === 'abstract' ? '⚡ Recall'
                : currentQuestion.type === 'explain' ? '💬 Explain'
                : currentQuestion.type === 'counterfactual' ? '🔀 Counterfactual'
                : '🔁 Transfer'}
            </div>

            <p style={{ fontSize: 17, color: 'var(--text)', lineHeight: 1.65, margin: '0 0 24px', whiteSpace: 'pre-line', fontWeight: 400 }}>
              {currentQuestion.question}
            </p>

            {/* Cloze */}
            {currentQuestion.cloze && (
              <div style={{ padding: '18px 20px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 15, color: 'var(--text-2)', lineHeight: 2.2 }}>
                {currentQuestion.cloze.before}{' '}
                <input
                  value={clozeAnswer}
                  onChange={e => setClozeAnswer(e.target.value)}
                  disabled={submitted}
                  onKeyDown={e => e.key === 'Enter' && !submitted && handleSubmit()}
                  placeholder="________"
                  style={{
                    padding: '5px 12px', borderRadius: 7,
                    border: submitted
                      ? clozeAnswer.toLowerCase().trim() === currentQuestion.cloze!.blank.toLowerCase()
                        ? '2px solid var(--green)' : '2px solid var(--red)'
                      : '1.5px solid var(--border-strong)',
                    background: 'var(--bg-input)', color: 'var(--text)', fontSize: 14,
                    fontFamily: 'inherit', outline: 'none', minWidth: 130,
                  }}
                />
                {', '}{currentQuestion.cloze.after}
              </div>
            )}

            {/* MCQ */}
            {currentQuestion.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {currentQuestion.options.map((opt, i) => {
                  const isCorrect = i === currentQuestion.correctIndex;
                  const isSelected = selectedOption === i;
                  let bg = 'var(--bg)';
                  let borderColor = 'var(--border)';
                  let textColor = 'var(--text-2)';
                  if (submitted) {
                    if (isCorrect) { bg = 'rgba(88,204,2,0.1)'; borderColor = 'var(--green)'; textColor = 'var(--text)'; }
                    else if (isSelected) { bg = 'rgba(255,75,75,0.08)'; borderColor = 'var(--red)'; }
                  } else if (isSelected) {
                    bg = rs.color + '10'; borderColor = rs.color; textColor = 'var(--text)';
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => !submitted && setSelectedOption(i)}
                      style={{
                        padding: '14px 18px', borderRadius: 10, textAlign: 'left',
                        background: bg, border: `1.5px solid ${borderColor}`,
                        color: textColor, cursor: submitted ? 'default' : 'pointer',
                        fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5,
                        transition: 'all 0.18s', display: 'flex', alignItems: 'center', gap: 12,
                      }}
                      onMouseEnter={e => { if (!submitted) (e.currentTarget as HTMLElement).style.borderColor = rs.color; }}
                      onMouseLeave={e => { if (!submitted && selectedOption !== i) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        border: `1.5px solid ${submitted && isCorrect ? 'var(--green)' : submitted && isSelected ? 'var(--red)' : isSelected ? rs.color : 'var(--border-strong)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: submitted && isCorrect ? 'rgba(88,204,2,0.2)' : submitted && isSelected ? 'rgba(255,75,75,0.2)' : 'transparent',
                        fontSize: 11, color: submitted && isCorrect ? 'var(--green)' : submitted && isSelected ? 'var(--red)' : 'var(--text-dim)',
                        fontWeight: 700,
                      }}>
                        {submitted && isCorrect ? '✓' : submitted && isSelected && !isCorrect ? '✗' : ['A', 'B', 'C', 'D'][i]}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Free text */}
            {isFreeText && (
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                disabled={submitted}
                placeholder="Write your explanation here..."
                rows={6}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 10,
                  background: 'var(--bg)', border: '1.5px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.65,
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = rs.color}
                onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
              />
            )}

            {/* Model answer */}
            {submitted && (
              <div style={{
                marginTop: 20, padding: '16px 18px', borderRadius: 10,
                background: 'rgba(88,204,2,0.07)', border: '1px solid rgba(88,204,2,0.25)',
                animation: 'fadeUp 0.3s ease',
              }}>
                <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 8, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Model Answer</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65 }}>{currentQuestion.explanation}</div>
              </div>
            )}
          </div>

          {/* Self-rating (free-text only) */}
          {needsSelfRating && (
            <div style={{ marginBottom: 20, animation: 'fadeUp 0.25s ease' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>How well did you know this?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {(Object.entries(ratingConfig) as [SelfRating, typeof ratingConfig[SelfRating]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => handleRate(key)}
                    style={{
                      padding: '14px 10px', borderRadius: 12,
                      background: cfg.bg, border: `1.5px solid ${cfg.color}50`,
                      color: cfg.color, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = `1.5px solid ${cfg.color}`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = `1.5px solid ${cfg.color}50`; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                  >{cfg.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!needsSelfRating && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              {!submitted ? (
                <button
                  onClick={handleSubmit}
                  disabled={currentQuestion.options ? selectedOption === null : currentQuestion.cloze ? !clozeAnswer.trim() : !answer.trim()}
                  style={{
                    padding: '13px 36px', borderRadius: 12, background: rs.color,
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15,
                    fontWeight: 700, fontFamily: 'inherit', transition: 'opacity 0.15s',
                    opacity: (currentQuestion.options ? selectedOption === null : currentQuestion.cloze ? !clozeAnswer.trim() : !answer.trim()) ? 0.45 : 1,
                  }}
                >Submit</button>
              ) : !isFreeText ? (
                <button
                  onClick={currentQuestion.cloze ? handleNextCloze : handleNextMCQ}
                  style={{
                    padding: '13px 36px', borderRadius: 12, background: 'var(--green)',
                    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15,
                    fontWeight: 700, fontFamily: 'inherit',
                  }}
                >Next →</button>
              ) : selfRated ? (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '13px 0' }}>Moving on...</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Mode Selector ── */
function ModeSelector({ onSelect }: { onSelect: (m: ReviewMode) => void }) {
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '32px 16px' : '48px 40px', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 860 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 28 : 48 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--green)' }}>
            <Target size={isMobile ? 32 : 40} strokeWidth={1.4} />
          </div>
          <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em', color: 'var(--text)' }}>Retest</h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
            {QUEUE.length} concepts due for review
          </p>
        </div>

        {/* Queue cards — mobile: 2x2, desktop: 4x1 */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: isMobile ? 28 : 48 }}>
          {QUEUE.map(item => {
            const rs = recallStatus(item.recall);
            const hex = item.recall >= 75 ? '#58CC02' : item.recall >= 50 ? '#FF9600' : '#FF4B4B';
            return (
              <div key={item.nodeId} style={{
                padding: isMobile ? '14px 12px' : '18px 16px', borderRadius: 14,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'var(--text)' }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: rs.color, fontWeight: 700 }}>{item.recall}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${item.recall}%`, background: `linear-gradient(90deg, ${hex}88, ${hex})` }} />
                </div>
                <div style={{ fontSize: 11, color: rs.color, fontWeight: 600 }}>{rs.label}</div>
              </div>
            );
          })}
        </div>

        {/* Mode cards — mobile: stacked vertically, desktop: side by side */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 16, textAlign: 'center' }}>Choose Mode</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 20 }}>
          <ModeCard
            title="Abstract"
            Icon={Zap}
            color="var(--blue)"
            desc="Fast flashcard recall. Fill in the blanks, test facts. Best when you're short on time."
            features={['Cloze fill-in-the-blank', 'Quick 1 question per concept', 'Tests surface memory']}
            onSelect={() => onSelect('abstract')}
          />
          <ModeCard
            title="Understand"
            Icon={Puzzle}
            color="var(--green)"
            desc="Explain mechanisms, test counterfactuals, apply to new cases. The real test of knowledge."
            features={['Multi-question sequence', 'Counterfactual reasoning', 'Transfer to new cases', 'Self-rated free responses']}
            recommended
            onSelect={() => onSelect('understand')}
          />
        </div>

        <button
          onClick={() => navigate('/brain')}
          style={{
            display: 'block', margin: '24px auto 0', background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}
        >← Back to Brain</button>
      </div>
    </div>
  );
}

function ModeCard({ title, Icon, color, desc, features, recommended, onSelect }: {
  title: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  color: string;
  desc: string;
  features: string[];
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        padding: '28px 28px', borderRadius: 16, textAlign: 'left',
        background: 'var(--bg-elevated)', fontFamily: 'inherit',
        border: recommended ? `2px solid ${color}` : '1px solid var(--border)',
        cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px rgba(0,0,0,0.3)`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {recommended && (
        <div style={{
          position: 'absolute', top: -11, right: 16, padding: '3px 10px',
          borderRadius: 6, background: color, color: '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        }}>RECOMMENDED</div>
      )}
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <span style={{ color }}><Icon size={24} strokeWidth={1.4} /></span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.02em' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 18 }}>{desc}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {features.map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: color + '20', border: `1px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={9} strokeWidth={2.5} style={{ color }} />
            </div>
            {f}
          </div>
        ))}
      </div>
    </button>
  );
}

/* ── Review Complete ── */
function ReviewComplete({ results, onDone }: { results: { label: string; before: number; after: number }[]; onDone: () => void }) {
  const navigate = useNavigate();
  const vw = useVW();
  const isMobile = vw < 640;
  const totalGain = results.reduce((s, r) => s + (r.after - r.before), 0);
  const improved = results.filter(r => r.after > r.before).length;

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 16px' : '40px', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--green)' }}>
            <PartyPopper size={isMobile ? 40 : 48} strokeWidth={1.2} />
          </div>
          <h2 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.03em' }}>Session Complete</h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>{results.length} concepts reviewed</p>
        </div>

        {/* Stats row — mobile: 2-col, desktop: 3-col */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Improved', value: improved, color: 'var(--green)' },
            { label: 'Total recall gain', value: `+${Math.max(0, totalGain)}%`, color: 'var(--blue)' },
            { label: 'Concepts done', value: results.length, color: 'var(--text)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: '14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Per-concept results */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 18px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }}>Results</div>
          {results.map(r => {
            const delta = r.after - r.before;
            const hex = r.after >= 75 ? '#58CC02' : r.after >= 50 ? '#FF9600' : '#FF4B4B';
            return (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, fontWeight: 500 }}>{r.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: isMobile ? 140 : 180 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>{r.before}%</span>
                  <div style={{ flex: 1, height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${r.after}%`, background: `linear-gradient(90deg, ${hex}88, ${hex})`, transition: 'width 1s ease' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)', width: 34 }}>
                    {delta > 0 ? '+' : ''}{delta}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/insights')}
            style={{
              flex: 1, padding: '13px', borderRadius: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 14,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >View Insights</button>
          <button
            onClick={onDone}
            style={{
              flex: 2, padding: '13px', borderRadius: 12, background: 'var(--green)',
              color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: 700, fontFamily: 'inherit',
            }}
          >Back to Brain →</button>
        </div>
      </div>
    </div>
  );
}
