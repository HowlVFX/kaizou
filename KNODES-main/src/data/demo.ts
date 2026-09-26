import type { GraphNode, GraphEdge, Note, MasterCluster } from '../types';

export const demoNodes: GraphNode[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    x: 420, y: 200,
    recall: 92, locked: false, subject: 'Programming',
    summary: 'A high-level, interpreted programming language that runs in the browser and on Node.js.',
    claims: [
      'JavaScript is single-threaded but uses an event loop for async operations.',
      'Variables can be declared with var, let, or const.',
      'Functions are first-class objects in JavaScript.',
    ],
    solo: 'Extended Abstract',
    related: ['hoisting', 'scope', 'executionPhase'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 18.2, lastReviewed: '2 days ago',
    evidence: { definition: 95, mechanism: 88, contrast: 75, boundary: 70, application: 85, counterfactual: 65 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'demonstrated', counterfactual: 'developing', transfer: 'demonstrated' },
  },
  {
    id: 'hoisting',
    label: 'Hoisting',
    x: 240, y: 360,
    recall: 42, locked: false, subject: 'Programming',
    summary: 'JavaScript\'s behavior of moving declarations to the top of their scope during the creation phase.',
    claims: [
      'var declarations are hoisted and initialized to undefined.',
      'let and const are hoisted but remain in the Temporal Dead Zone.',
      'Function declarations are fully hoisted — name and body.',
    ],
    solo: 'Relational',
    prerequisites: ['creationPhase'],
    related: ['var', 'tdz', 'executionPhase'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 7.3, lastReviewed: '5 days ago',
    evidence: { definition: 88, mechanism: 72, contrast: 60, boundary: 45, application: 65, counterfactual: 35 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'developing', transfer: 'none' },
    process: ['Source code parsed', 'Creation phase begins', 'var declarations registered → undefined', 'let/const registered → TDZ', 'Function bodies hoisted', 'Execution phase begins'],
  },
  {
    id: 'scope',
    label: 'Scope',
    x: 560, y: 380,
    recall: 64, locked: false, subject: 'Programming',
    summary: 'The visibility and lifetime of variables defined in a JavaScript program.',
    claims: [
      'var is function-scoped, not block-scoped.',
      'let and const are block-scoped.',
      'Closures capture variables from outer scopes.',
    ],
    solo: 'Multistructural',
    related: ['javascript', 'hoisting', 'var'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 9.1, lastReviewed: '3 days ago',
    evidence: { definition: 85, mechanism: 70, contrast: 65, boundary: 55, application: 60, counterfactual: 30 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'creationPhase',
    label: 'Creation Phase',
    x: 100, y: 300,
    recall: null, locked: true, subject: 'Programming',
    summary: 'The first phase of JavaScript execution where declarations are processed before any code runs.',
  },
  {
    id: 'executionPhase',
    label: 'Execution Phase',
    x: 600, y: 240,
    recall: 88, locked: false, subject: 'Programming',
    summary: 'The second phase of JavaScript execution where code actually runs line by line.',
    claims: [
      'Variables are accessed by their declared values during execution.',
      'Functions execute in their own execution context.',
    ],
    solo: 'Relational',
    related: ['hoisting', 'scope'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 12.4, lastReviewed: '1 day ago',
    evidence: { definition: 90, mechanism: 85, contrast: 70, boundary: 60, application: 75, counterfactual: 50 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'demonstrated', counterfactual: 'developing', transfer: 'none' },
  },
  {
    id: 'var',
    label: 'var',
    x: 160, y: 470,
    recall: 58, locked: false, subject: 'Programming',
    summary: 'The original way to declare variables in JavaScript, function-scoped and hoisted.',
    claims: ['var is function-scoped.', 'var is hoisted to undefined.', 'var can be redeclared.'],
    solo: 'Unistructural',
    related: ['hoisting', 'scope', 'let'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 8.0, lastReviewed: '4 days ago',
    evidence: { definition: 80, mechanism: 55, contrast: 60, boundary: 40, application: 50, counterfactual: 25 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'let',
    label: 'let',
    x: 310, y: 510,
    recall: 79, locked: false, subject: 'Programming',
    summary: 'Block-scoped variable declaration introduced in ES6.',
    claims: ['let is block-scoped.', 'let is in TDZ before initialization.', 'let cannot be redeclared in the same scope.'],
    solo: 'Unistructural',
    related: ['var', 'const', 'tdz'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 10.5, lastReviewed: '2 days ago',
    evidence: { definition: 82, mechanism: 60, contrast: 70, boundary: 55, application: 60, counterfactual: 30 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'const',
    label: 'const',
    x: 420, y: 530,
    recall: 83, locked: false, subject: 'Programming',
    summary: 'Block-scoped constant declaration. The binding cannot be reassigned.',
    claims: ['const must be initialized at declaration.', 'const prevents reassignment of the binding.', 'Objects declared with const can still be mutated.'],
    solo: 'Unistructural',
    related: ['let', 'var'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 11.2, lastReviewed: '2 days ago',
    evidence: { definition: 85, mechanism: 62, contrast: 68, boundary: 60, application: 55, counterfactual: 28 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'tdz',
    label: 'TDZ',
    x: 210, y: 560,
    recall: 37, locked: false, subject: 'Programming',
    summary: 'Temporal Dead Zone — the region between the start of a block and the initialization of a let/const variable.',
    claims: ['Accessing a let/const in the TDZ throws a ReferenceError.', 'TDZ ends when the declaration line is reached.'],
    solo: 'Unistructural',
    related: ['let', 'const', 'hoisting'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 5.8, lastReviewed: '6 days ago',
    evidence: { definition: 65, mechanism: 45, contrast: 40, boundary: 35, application: 30, counterfactual: 20 },
    assessmentEvidence: { recall: 'developing', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'functionDecl',
    label: 'Function Decl.',
    x: 530, y: 140,
    recall: 85, locked: false, subject: 'Programming',
    summary: 'Function declarations are fully hoisted — both the name and the function body are available from the start of the scope.',
    claims: ['Function declarations are fully hoisted.', 'Function expressions are not hoisted.'],
    solo: 'Multistructural',
    related: ['hoisting', 'javascript'],
    sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 13.0, lastReviewed: '1 day ago',
    evidence: { definition: 88, mechanism: 78, contrast: 65, boundary: 55, application: 70, counterfactual: 40 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'none', transfer: 'none' },
  },
  // Networking cluster
  {
    id: 'tcp',
    label: 'TCP',
    x: 780, y: 190,
    recall: 61, locked: false, subject: 'Networking',
    summary: 'Transmission Control Protocol — a connection-oriented, reliable transport protocol.',
    claims: ['TCP provides ordered, reliable delivery.', 'TCP uses a three-way handshake to establish connections.'],
    solo: 'Multistructural',
    related: ['udp', 'handshake', 'ports'],
    sourceNote: 'Networking Basics.md',
    halfLife: 8.5, lastReviewed: '4 days ago',
    evidence: { definition: 78, mechanism: 65, contrast: 72, boundary: 50, application: 55, counterfactual: 25 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'udp',
    label: 'UDP',
    x: 900, y: 280,
    recall: 55, locked: false, subject: 'Networking',
    summary: 'User Datagram Protocol — connectionless, fast but unreliable.',
    claims: ['UDP does not guarantee delivery.', 'UDP has lower overhead than TCP.'],
    solo: 'Unistructural',
    related: ['tcp'],
    sourceNote: 'Networking Basics.md',
    halfLife: 7.2, lastReviewed: '5 days ago',
    evidence: { definition: 75, mechanism: 50, contrast: 65, boundary: 40, application: 45, counterfactual: 20 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'handshake',
    label: 'Three-Way Handshake',
    x: 740, y: 340,
    recall: 78, locked: false, subject: 'Networking',
    summary: 'The process TCP uses to establish a connection: SYN → SYN-ACK → ACK.',
    claims: ['SYN starts the connection.', 'SYN-ACK acknowledges and responds.', 'ACK completes the handshake.'],
    solo: 'Relational',
    related: ['tcp'],
    sourceNote: 'Networking Basics.md',
    halfLife: 11.0, lastReviewed: '2 days ago',
    evidence: { definition: 85, mechanism: 80, contrast: 60, boundary: 55, application: 65, counterfactual: 35 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'demonstrated', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'ports',
    label: 'Ports',
    x: 920, y: 150,
    recall: 90, locked: false, subject: 'Networking',
    summary: 'Logical endpoints for network communication, identified by numbers 0–65535.',
    claims: ['Well-known ports are 0–1023.', 'HTTP uses port 80, HTTPS uses 443.'],
    solo: 'Unistructural',
    related: ['tcp', 'udp'],
    sourceNote: 'Networking Basics.md',
    halfLife: 15.3, lastReviewed: '1 day ago',
    evidence: { definition: 90, mechanism: 60, contrast: 55, boundary: 65, application: 70, counterfactual: 30 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  // ── Variables & Scope new nodes ───────────────────────────────────────────
  {
    id: 'binding',
    label: 'Variable Binding',
    x: 360, y: 620,
    recall: 72, locked: false, subject: 'Programming',
    summary: 'The association between an identifier and the storage or value it refers to within an execution environment.',
    claims: [
      'A binding associates a name with a value or storage location.',
      'let, const, and var create bindings with different scoping behavior.',
      'A binding and the value associated with it are conceptually distinct.',
    ],
    prerequisites: ['javascript'],
    related: ['let', 'const', 'var', 'scope', 'shadowing'],
    solo: 'Multistructural', sourceNote: 'JavaScript Fundamentals.md',
    halfLife: 9.4, lastReviewed: '3 days ago',
    evidence: { definition: 78, mechanism: 68, contrast: 62, boundary: 55, application: 65, counterfactual: 42 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'developing', transfer: 'none' },
    process: [
      'An identifier is associated with a binding.',
      'The binding exists within an execution environment.',
      'A declaration determines how that binding behaves.',
      'The binding may be initialized with a value.',
      'Later operations may read or update the associated value depending on declaration semantics.',
    ],
  },
  {
    id: 'block',
    label: 'Block',
    x: 520, y: 650,
    recall: 69, locked: false, subject: 'Programming',
    summary: 'A syntactic region delimited by braces that can define a lexical scope in JavaScript.',
    claims: [
      'Blocks are commonly written using curly braces.',
      'let and const declarations are scoped to the containing block.',
      'A nested block can create a new lexical environment.',
    ],
    prerequisites: ['javascript'],
    related: ['scope', 'lexicalScope', 'let', 'const'],
    solo: 'Multistructural',
    evidence: { definition: 76, mechanism: 64, contrast: 60, boundary: 48, application: 58, counterfactual: 35 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'lexicalScope',
    label: 'Lexical Scope',
    x: 650, y: 700,
    recall: 57, locked: false, subject: 'Programming',
    summary: 'The scope determined by where declarations appear in source code rather than by the order in which functions are called.',
    claims: [
      'Lexical scope is determined by program structure.',
      'Nested code can access bindings from surrounding lexical scopes.',
      'let and const participate in lexical scoping.',
    ],
    prerequisites: ['scope', 'block'],
    related: ['closure', 'shadowing', 'let', 'const'],
    solo: 'Relational',
    evidence: { definition: 70, mechanism: 54, contrast: 45, boundary: 42, application: 48, counterfactual: 25 },
    assessmentEvidence: { recall: 'developing', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'functionScope',
    label: 'Function Scope',
    x: 500, y: 780,
    recall: 63, locked: false, subject: 'Programming',
    summary: 'The visibility region associated with a function, especially important for understanding var declarations.',
    claims: [
      'var declarations are scoped to functions rather than blocks.',
      'A function creates an execution context with its own bindings.',
      'Function scope differs from block scope.',
    ],
    prerequisites: ['scope', 'functionDecl'],
    related: ['var', 'lexicalScope'],
    solo: 'Relational',
    evidence: { definition: 74, mechanism: 60, contrast: 60, boundary: 52, application: 50, counterfactual: 28 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'shadowing',
    label: 'Variable Shadowing',
    x: 760, y: 790,
    recall: 49, locked: false, subject: 'Programming',
    summary: 'When a declaration in an inner scope uses the same identifier name as a binding in an outer scope.',
    claims: [
      'An inner declaration can hide an outer binding with the same name.',
      'Lookup resolves to the nearest applicable binding.',
      'Shadowing is related to lexical scope and nested environments.',
    ],
    prerequisites: ['lexicalScope', 'binding'],
    related: ['scope', 'closure', 'let', 'const'],
    solo: 'Relational',
    evidence: { definition: 62, mechanism: 45, contrast: 40, boundary: 38, application: 42, counterfactual: 22 },
    assessmentEvidence: { recall: 'developing', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
  // ── Functions & Closures new nodes ────────────────────────────────────────
  {
    id: 'functionExecution',
    label: 'Function Execution',
    x: 900, y: 620,
    recall: 74, locked: false, subject: 'Programming',
    summary: 'The creation and execution of an execution context when a JavaScript function is called.',
    claims: [
      'Calling a function creates an execution context.',
      'Parameters become bindings in the function context.',
      'Execution proceeds using the function body and available lexical environment.',
    ],
    prerequisites: ['javascript', 'executionPhase'],
    related: ['functionDecl', 'parameters', 'closure', 'scope'],
    solo: 'Relational',
    evidence: { definition: 82, mechanism: 75, contrast: 62, boundary: 60, application: 72, counterfactual: 48 },
    process: [
      'The function is called.',
      'A function execution context is created.',
      'Parameters are initialized as bindings.',
      'The function body executes.',
      'The function returns a value or completes without one.',
    ],
  },
  {
    id: 'parameters',
    label: 'Parameters',
    x: 1040, y: 680,
    recall: 81, locked: false, subject: 'Programming',
    summary: 'Named inputs declared by a function and initialized from the arguments supplied at call time.',
    claims: [
      'Parameters receive values from function arguments.',
      'Parameters are bindings within the function execution context.',
      'Default parameter values can provide fallback initialization.',
    ],
    prerequisites: ['functionExecution', 'binding'],
    related: ['returnValue', 'closure'],
    solo: 'Multistructural',
  },
  {
    id: 'returnValue',
    label: 'Return Value',
    x: 1080, y: 780,
    recall: 66, locked: false, subject: 'Programming',
    summary: 'The value produced by a function and passed back to the code that called it.',
    claims: [
      'return can provide a value to the caller.',
      'Executing return exits the current function.',
      'A function without an explicit return produces undefined.',
    ],
    prerequisites: ['functionExecution'],
    related: ['parameters', 'callback'],
    solo: 'Multistructural',
  },
  {
    id: 'closure',
    label: 'Closure',
    x: 900, y: 840,
    recall: 44, locked: false, subject: 'Programming',
    summary: 'A function together with the lexical environment it retains access to.',
    claims: [
      'A closure can access bindings from its surrounding lexical scope.',
      'The function can retain access to those bindings after the outer function has returned.',
      'Closures arise from lexical scoping rather than from a special closure declaration.',
    ],
    prerequisites: ['functionExecution', 'lexicalScope', 'binding'],
    related: ['callback', 'shadowing', 'scope'],
    solo: 'Relational',
    evidence: { definition: 58, mechanism: 38, contrast: 32, boundary: 30, application: 35, counterfactual: 15 },
    assessmentEvidence: { recall: 'developing', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
    process: [
      'A function is created inside a lexical environment.',
      'The function references bindings from that environment.',
      'The function is returned or passed elsewhere.',
      'The outer function may finish execution.',
      'The inner function can still access the captured bindings when invoked later.',
    ],
  },
  {
    id: 'callback',
    label: 'Callback',
    x: 1110, y: 900,
    recall: 59, locked: false, subject: 'Programming',
    summary: 'A function supplied to another function so it can be invoked later or as part of another operation.',
    claims: [
      'Functions can be passed as values.',
      'A callback may execute later than the point where it is passed.',
      'Closures often allow callbacks to retain access to surrounding state.',
    ],
    prerequisites: ['functionExecution', 'closure'],
    related: ['higherOrderFunction', 'javascript'],
    solo: 'Relational',
  },
  {
    id: 'higherOrderFunction',
    label: 'Higher-Order Function',
    x: 1260, y: 820,
    recall: 68, locked: false, subject: 'Programming',
    summary: 'A function that accepts functions as arguments, returns a function, or both.',
    claims: [
      'Functions are first-class values in JavaScript.',
      'A higher-order function can receive another function.',
      'A higher-order function can return another function.',
    ],
    prerequisites: ['functionExecution', 'callback'],
    related: ['closure'],
    solo: 'Relational',
  },
  // ── Async JavaScript new nodes ─────────────────────────────────────────────
  {
    id: 'callStack',
    label: 'Call Stack',
    x: 1360, y: 160,
    recall: 61, locked: false, subject: 'Programming',
    summary: 'The execution structure JavaScript uses to track active function calls.',
    claims: [
      'Active function calls are represented on the call stack.',
      'The top of the stack represents the currently executing call.',
      'A deeply nested chain of synchronous calls can exhaust stack space.',
    ],
    prerequisites: ['functionExecution'],
    related: ['eventLoop', 'executionPhase'],
    solo: 'Multistructural',
  },
  {
    id: 'eventLoop',
    label: 'Event Loop',
    x: 1510, y: 240,
    recall: 54, locked: false, subject: 'Programming',
    summary: 'The coordination mechanism that allows JavaScript to process queued asynchronous work after the current execution stack is clear.',
    claims: [
      'The event loop coordinates execution with queued asynchronous work.',
      'JavaScript can continue responsive work without blocking on every external operation.',
      'Queued work is processed according to event-loop scheduling rules.',
    ],
    prerequisites: ['callStack', 'executionPhase'],
    related: ['taskQueue', 'promise', 'microtaskQueue'],
    solo: 'Relational',
    process: [
      'Synchronous code executes on the call stack.',
      'Asynchronous work is handled by the surrounding runtime.',
      'Completed work becomes eligible for queueing.',
      'The event loop checks whether the call stack is available.',
      'Queued work is moved toward execution according to scheduling rules.',
    ],
  },
  {
    id: 'taskQueue',
    label: 'Task Queue',
    x: 1650, y: 320,
    recall: 47, locked: false, subject: 'Programming',
    summary: 'A queue used by the JavaScript runtime to hold tasks waiting to be processed.',
    claims: [
      'Tasks wait until the runtime can process them.',
      'Queueing separates asynchronous completion from immediate synchronous execution.',
      'Task scheduling interacts with the event loop.',
    ],
    prerequisites: ['eventLoop'],
    related: ['asyncAwait'],
    solo: 'Multistructural',
  },
  {
    id: 'promise',
    label: 'Promise',
    x: 1510, y: 420,
    recall: 73, locked: false, subject: 'Programming',
    summary: 'An object representing the eventual completion or failure of an asynchronous operation.',
    claims: [
      'A promise represents an eventual result.',
      'A promise can be pending, fulfilled, or rejected.',
      'then, catch, and finally attach behavior to promise settlement.',
    ],
    prerequisites: ['eventLoop', 'functionExecution'],
    related: ['microtaskQueue', 'asyncAwait', 'fetch'],
    solo: 'Relational',
  },
  {
    id: 'microtaskQueue',
    label: 'Microtask Queue',
    x: 1640, y: 470,
    recall: 42, locked: false, subject: 'Programming',
    summary: 'A queue used for promise reactions and other microtasks that are processed at specific points between tasks.',
    claims: [
      'Promise reactions are scheduled as microtasks.',
      'Microtasks are processed before the runtime moves on to the next task.',
      'Microtask ordering can affect observable execution order.',
    ],
    prerequisites: ['promise', 'eventLoop'],
    related: ['taskQueue', 'asyncAwait'],
    solo: 'Relational',
  },
  {
    id: 'asyncAwait',
    label: 'async / await',
    x: 1780, y: 420,
    recall: 76, locked: false, subject: 'Programming',
    summary: 'Syntax for writing promise-based asynchronous control flow in a sequential-looking style.',
    claims: [
      'An async function returns a promise.',
      'await pauses the async function until the awaited promise settles.',
      'await does not freeze the entire JavaScript runtime.',
    ],
    prerequisites: ['promise', 'eventLoop'],
    related: ['fetch', 'microtaskQueue'],
    solo: 'Relational',
  },
  {
    id: 'fetch',
    label: 'fetch()',
    x: 1900, y: 500,
    recall: 82, locked: false, subject: 'Web APIs',
    summary: 'A Web API used to initiate network requests and work with the resulting promise.',
    claims: [
      'fetch returns a promise.',
      'The response becomes available asynchronously.',
      'fetch can be combined with async/await.',
    ],
    prerequisites: ['promise', 'asyncAwait'],
    related: ['tcp', 'http'],
    solo: 'Relational',
  },
  // ── Locked prerequisite nodes ──────────────────────────────────────────────
  {
    id: 'eventLoopInternals',
    label: 'Event Loop Internals',
    x: 1780, y: 180,
    recall: null, locked: true, subject: 'Programming',
    summary: 'Deeper runtime scheduling details required for advanced event-loop reasoning.',
    prerequisites: ['eventLoop'],
    related: ['microtaskQueue', 'taskQueue'],
  },
  {
    id: 'garbageCollection',
    label: 'Garbage Collection',
    x: 880, y: 970,
    recall: null, locked: true, subject: 'Programming',
    summary: 'Runtime memory-management process that reclaims memory no longer reachable by the program.',
    related: ['closure', 'javascript'],
  },
  // ── Networking expanded nodes ──────────────────────────────────────────────
  {
    id: 'ipAddress',
    label: 'IP Address',
    x: 500, y: 1050,
    recall: 70, locked: false, subject: 'Networking',
    summary: 'An address used to identify a network interface or endpoint at the network layer.',
    claims: [
      'IP addresses identify network endpoints.',
      'IPv4 and IPv6 use different address formats.',
      'Routing uses IP addressing to move packets between networks.',
    ],
    prerequisites: ['tcp'],
    related: ['dns', 'packet', 'ports'],
  },
  {
    id: 'dns',
    label: 'DNS',
    x: 650, y: 1080,
    recall: 63, locked: false, subject: 'Networking',
    summary: 'The naming system that maps domain names to network addresses.',
    claims: [
      'DNS translates human-readable domain names into address information.',
      'DNS resolution can happen before a client connects to a server.',
      'DNS caching can reduce repeated lookup work.',
    ],
    prerequisites: ['ipAddress'],
    related: ['http', 'tcp'],
  },
  {
    id: 'http',
    label: 'HTTP',
    x: 820, y: 1080,
    recall: 79, locked: false, subject: 'Networking',
    summary: 'An application-layer protocol used for request-and-response communication on the web.',
    claims: [
      'HTTP uses requests and responses.',
      'Methods such as GET and POST describe intended operations.',
      'HTTP operates above transport protocols such as TCP.',
    ],
    prerequisites: ['tcp', 'ports'],
    related: ['tls', 'fetch', 'dns'],
    solo: 'Relational',
  },
  {
    id: 'tls',
    label: 'TLS',
    x: 980, y: 1120,
    recall: 56, locked: false, subject: 'Networking',
    summary: 'A security protocol that protects network communication through encryption and authentication.',
    claims: [
      'TLS protects data in transit.',
      'TLS provides mechanisms for server authentication.',
      'HTTPS uses HTTP over a TLS-protected connection.',
    ],
    prerequisites: ['tcp', 'http'],
    related: ['ports'],
  },
  {
    id: 'packet',
    label: 'Network Packet',
    x: 430, y: 1180,
    recall: 68, locked: false, subject: 'Networking',
    summary: 'A unit of data carried through a packet-switched network.',
    claims: [
      'Packets contain data plus control information.',
      'Packets can travel through multiple network devices.',
      'Transport protocols provide additional delivery semantics.',
    ],
    prerequisites: ['ipAddress'],
    related: ['tcp', 'udp'],
  },
  // ── Database expanded nodes ────────────────────────────────────────────────
  {
    id: 'table',
    label: 'Database Table',
    x: 1120, y: 1200,
    recall: 84, locked: false, subject: 'Databases',
    summary: 'A relational structure organized into rows and columns.',
    claims: ['Rows represent records.', 'Columns represent attributes.', 'Tables can be related through keys.'],
    prerequisites: ['sql'],
    related: ['primaryKey', 'foreignKey', 'normalization'],
  },
  {
    id: 'primaryKey',
    label: 'Primary Key',
    x: 1230, y: 1280,
    recall: 77, locked: false, subject: 'Databases',
    summary: 'A column or set of columns that uniquely identifies a row in a relational table.',
    claims: [
      'A primary key identifies rows uniquely.',
      'A primary key should not contain duplicate key values.',
      'Primary keys support reliable references between records.',
    ],
    prerequisites: ['table'],
    related: ['foreignKey', 'normalization'],
  },
  {
    id: 'foreignKey',
    label: 'Foreign Key',
    x: 1370, y: 1320,
    recall: 61, locked: false, subject: 'Databases',
    summary: 'A column or set of columns used to reference a key in another table.',
    claims: [
      'Foreign keys connect related tables.',
      'Foreign key values reference key values in another table.',
      'Foreign keys help preserve referential relationships.',
    ],
    prerequisites: ['primaryKey', 'table'],
    related: ['join', 'normalization'],
  },
  {
    id: 'join',
    label: 'SQL JOIN',
    x: 1480, y: 1380,
    recall: 72, locked: false, subject: 'Databases',
    summary: 'An SQL operation that combines rows from related tables according to a join condition.',
    claims: [
      'JOIN combines rows from multiple tables.',
      'A join condition determines how rows are matched.',
      'Different join types retain different subsets of rows.',
    ],
    prerequisites: ['sql', 'foreignKey'],
    related: ['table', 'normalization'],
  },
  {
    id: 'transaction',
    label: 'DB Transaction',
    x: 1260, y: 1450,
    recall: 58, locked: false, subject: 'Databases',
    summary: 'A logical unit of database operations treated as a single operation for consistency purposes.',
    claims: [
      'Transactions group related database operations.',
      'A transaction can be committed or rolled back.',
      'Transactions provide the foundation for atomic updates.',
    ],
    prerequisites: ['sql'],
    related: ['acid'],
  },
  {
    id: 'acid',
    label: 'ACID',
    x: 1400, y: 1520,
    recall: 46, locked: false, subject: 'Databases',
    summary: 'A set of properties describing important reliability guarantees for database transactions.',
    claims: [
      'Atomicity treats a transaction as an all-or-nothing unit.',
      'Consistency preserves defined database constraints.',
      'Isolation controls interaction between concurrent transactions.',
      'Durability preserves committed results against later failure.',
    ],
    prerequisites: ['transaction'],
    related: ['normalization', 'sql'],
    solo: 'Relational',
  },
  // ── React Fundamentals new nodes ───────────────────────────────────────────
  {
    id: 'react',
    label: 'React',
    x: 1050, y: 300,
    recall: 88, locked: false, subject: 'Web Development',
    summary: 'A JavaScript library for building user interfaces from reusable components.',
    claims: [
      'React interfaces are built from components.',
      'Component rendering responds to state and prop changes.',
      'React encourages declarative UI descriptions.',
    ],
    prerequisites: ['javascript'],
    related: ['component', 'state', 'render'],
  },
  {
    id: 'component',
    label: 'React Component',
    x: 1160, y: 380,
    recall: 82, locked: false, subject: 'Web Development',
    summary: 'A reusable unit of UI logic and presentation in React.',
    claims: [
      'Components can receive data through props.',
      'Components can manage local state.',
      'Components describe UI declaratively.',
    ],
    prerequisites: ['react'],
    related: ['props', 'state', 'render'],
  },
  {
    id: 'props',
    label: 'Props',
    x: 1280, y: 430,
    recall: 74, locked: false, subject: 'Web Development',
    summary: 'Input data passed from a parent React component to a child component.',
    claims: [
      'Props flow from parent to child.',
      'A child should treat props as inputs rather than mutate the parent data directly.',
      'Props allow components to be reused with different data.',
    ],
    prerequisites: ['component'],
    related: ['state'],
  },
  {
    id: 'state',
    label: 'React State',
    x: 1290, y: 540,
    recall: 69, locked: false, subject: 'Web Development',
    summary: 'Data owned by a component that can change over time and affect rendering.',
    claims: [
      'State represents data that can change during component use.',
      'Updating state schedules React to render based on the new state.',
      'State belongs to a component instance.',
    ],
    prerequisites: ['component', 'javascript'],
    related: ['useState', 'render', 'props'],
  },
  {
    id: 'useState',
    label: 'useState',
    x: 1420, y: 600,
    recall: 86, locked: false, subject: 'Web Development',
    summary: 'A React Hook used to add state to a function component.',
    claims: [
      'useState returns a state value and a state updater.',
      'Calling the updater schedules a new render.',
      'State values persist across renders for the component instance.',
    ],
    prerequisites: ['state', 'component'],
    related: ['render', 'useEffect'],
    process: [
      'The component calls useState.',
      'React associates state with that component instance.',
      'The component receives the current state value.',
      'The updater is used to request a new state value.',
      'React schedules a render using the updated state.',
    ],
  },
  {
    id: 'render',
    label: 'React Render',
    x: 1510, y: 520,
    recall: 64, locked: false, subject: 'Web Development',
    summary: 'The process of React evaluating a component to determine the UI representation for the current state and props.',
    claims: [
      'A render evaluates components using current props and state.',
      'A render does not mean the browser necessarily replaces the entire DOM.',
      'State updates can trigger another render.',
    ],
    prerequisites: ['component', 'state'],
    related: ['useState', 'useEffect'],
  },
  {
    id: 'useEffect',
    label: 'useEffect',
    x: 1650, y: 650,
    recall: 71, locked: false, subject: 'Web Development',
    summary: 'A React Hook used to synchronize a component with external systems after rendering.',
    claims: [
      'useEffect runs after a component render commits.',
      'The dependency array controls when the effect is re-run.',
      'Effects are intended for synchronization with external systems rather than ordinary derived rendering logic.',
    ],
    prerequisites: ['component', 'render'],
    related: ['dependencyArray', 'asyncAwait'],
  },
  {
    id: 'dependencyArray',
    label: 'Effect Dependencies',
    x: 1780, y: 720,
    recall: 52, locked: false, subject: 'Web Development',
    summary: 'The values React uses to determine when an effect should run again.',
    claims: [
      'Dependencies are compared between renders.',
      'A changed dependency can cause an effect to run again.',
      'An empty dependency array expresses a different execution condition than omitting the array.',
    ],
    prerequisites: ['useEffect', 'render'],
    related: ['state', 'props'],
  },
  // ── Database cluster (original nodes below) ────────────────────────────────
  {
    id: 'normalization',
    label: 'Normalization',
    x: 780, y: 490,
    recall: 53, locked: false, subject: 'Databases',
    summary: 'The process of organizing a relational database to reduce data redundancy.',
    claims: ['1NF eliminates repeating groups.', '2NF removes partial dependencies.', '3NF removes transitive dependencies.'],
    solo: 'Multistructural',
    related: ['sql', 'indexing'],
    sourceNote: 'Database Design.md',
    halfLife: 7.8, lastReviewed: '5 days ago',
    evidence: { definition: 80, mechanism: 65, contrast: 58, boundary: 45, application: 55, counterfactual: 25 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'developing', counterfactual: 'none', transfer: 'none' },
  },
  {
    id: 'sql',
    label: 'SQL',
    x: 880, y: 440,
    recall: 82, locked: false, subject: 'Databases',
    summary: 'Structured Query Language for managing relational databases.',
    claims: ['SELECT retrieves data.', 'JOIN combines rows from multiple tables.', 'Indexes speed up queries.'],
    solo: 'Relational',
    related: ['normalization', 'indexing'],
    sourceNote: 'Database Design.md',
    halfLife: 12.8, lastReviewed: '2 days ago',
    evidence: { definition: 85, mechanism: 75, contrast: 65, boundary: 60, application: 80, counterfactual: 45 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'demonstrated', counterfactual: 'developing', transfer: 'none' },
  },
  {
    id: 'indexing',
    label: 'Indexing',
    x: 850, y: 560,
    recall: 71, locked: false, subject: 'Databases',
    summary: 'Database optimization technique that speeds up data retrieval at the cost of additional storage.',
    claims: ['B-tree indexes are common.', 'Indexes slow down write operations.', 'Composite indexes cover multiple columns.'],
    solo: 'Unistructural',
    related: ['sql', 'normalization'],
    sourceNote: 'Database Design.md',
    halfLife: 9.5, lastReviewed: '3 days ago',
    evidence: { definition: 78, mechanism: 62, contrast: 55, boundary: 50, application: 60, counterfactual: 28 },
    assessmentEvidence: { recall: 'demonstrated', processTrace: 'none', counterfactual: 'none', transfer: 'none' },
  },
];

export const demoEdges: GraphEdge[] = [
  // ── JS Fundamentals ─────────────────────────────────────────────────────
  { source: 'javascript', target: 'hoisting', type: 'semantic' },
  { source: 'javascript', target: 'scope', type: 'semantic' },
  { source: 'javascript', target: 'executionPhase', type: 'semantic' },
  { source: 'javascript', target: 'functionDecl', type: 'semantic' },
  { source: 'hoisting', target: 'creationPhase', type: 'requires' },
  { source: 'hoisting', target: 'var', type: 'semantic' },
  { source: 'hoisting', target: 'let', type: 'semantic' },
  { source: 'hoisting', target: 'tdz', type: 'semantic' },
  { source: 'let', target: 'tdz', type: 'requires' },
  { source: 'const', target: 'tdz', type: 'requires' },
  { source: 'var', target: 'scope', type: 'semantic' },
  { source: 'let', target: 'scope', type: 'semantic' },
  { source: 'const', target: 'scope', type: 'semantic' },
  { source: 'executionPhase', target: 'hoisting', type: 'semantic' },
  { source: 'let', target: 'const', type: 'semantic' },
  { source: 'let', target: 'var', type: 'semantic' },
  // ── Variables & Scope ────────────────────────────────────────────────────
  { source: 'javascript', target: 'binding', type: 'requires' },
  { source: 'javascript', target: 'block', type: 'requires' },
  { source: 'scope', target: 'lexicalScope', type: 'requires' },
  { source: 'block', target: 'lexicalScope', type: 'requires' },
  { source: 'lexicalScope', target: 'shadowing', type: 'requires' },
  { source: 'binding', target: 'shadowing', type: 'requires' },
  { source: 'scope', target: 'functionScope', type: 'requires' },
  { source: 'functionDecl', target: 'functionScope', type: 'requires' },
  { source: 'closure', target: 'shadowing', type: 'semantic' },
  // ── Functions & Closures ─────────────────────────────────────────────────
  { source: 'javascript', target: 'functionExecution', type: 'requires' },
  { source: 'executionPhase', target: 'functionExecution', type: 'requires' },
  { source: 'functionExecution', target: 'parameters', type: 'requires' },
  { source: 'binding', target: 'parameters', type: 'requires' },
  { source: 'functionExecution', target: 'returnValue', type: 'requires' },
  { source: 'functionExecution', target: 'closure', type: 'requires' },
  { source: 'lexicalScope', target: 'closure', type: 'requires' },
  { source: 'binding', target: 'closure', type: 'requires' },
  { source: 'functionExecution', target: 'callback', type: 'requires' },
  { source: 'closure', target: 'callback', type: 'requires' },
  { source: 'callback', target: 'higherOrderFunction', type: 'requires' },
  { source: 'functionExecution', target: 'higherOrderFunction', type: 'requires' },
  // ── Async JavaScript ─────────────────────────────────────────────────────
  { source: 'functionExecution', target: 'callStack', type: 'requires' },
  { source: 'callStack', target: 'eventLoop', type: 'requires' },
  { source: 'executionPhase', target: 'eventLoop', type: 'requires' },
  { source: 'eventLoop', target: 'taskQueue', type: 'requires' },
  { source: 'eventLoop', target: 'promise', type: 'requires' },
  { source: 'functionExecution', target: 'promise', type: 'requires' },
  { source: 'promise', target: 'microtaskQueue', type: 'requires' },
  { source: 'eventLoop', target: 'asyncAwait', type: 'requires' },
  { source: 'promise', target: 'asyncAwait', type: 'requires' },
  { source: 'asyncAwait', target: 'fetch', type: 'requires' },
  { source: 'promise', target: 'fetch', type: 'requires' },
  { source: 'eventLoop', target: 'eventLoopInternals', type: 'requires' },
  { source: 'promise', target: 'asyncAwait', type: 'semantic' },
  // ── Networking ───────────────────────────────────────────────────────────
  { source: 'tcp', target: 'handshake', type: 'requires' },
  { source: 'tcp', target: 'ipAddress', type: 'requires' },
  { source: 'tcp', target: 'packet', type: 'requires' },
  { source: 'tcp', target: 'http', type: 'requires' },
  { source: 'ports', target: 'http', type: 'requires' },
  { source: 'ipAddress', target: 'dns', type: 'requires' },
  { source: 'ipAddress', target: 'packet', type: 'requires' },
  { source: 'http', target: 'tls', type: 'requires' },
  { source: 'tcp', target: 'udp', type: 'semantic' },
  { source: 'http', target: 'fetch', type: 'semantic' },
  // ── Databases ────────────────────────────────────────────────────────────
  { source: 'normalization', target: 'sql', type: 'semantic' },
  { source: 'sql', target: 'indexing', type: 'semantic' },
  { source: 'sql', target: 'table', type: 'requires' },
  { source: 'table', target: 'primaryKey', type: 'requires' },
  { source: 'primaryKey', target: 'foreignKey', type: 'requires' },
  { source: 'table', target: 'foreignKey', type: 'requires' },
  { source: 'foreignKey', target: 'join', type: 'requires' },
  { source: 'sql', target: 'join', type: 'requires' },
  { source: 'sql', target: 'transaction', type: 'requires' },
  { source: 'transaction', target: 'acid', type: 'requires' },
  { source: 'normalization', target: 'primaryKey', type: 'semantic' },
  { source: 'normalization', target: 'foreignKey', type: 'semantic' },
  // ── React ────────────────────────────────────────────────────────────────
  { source: 'javascript', target: 'react', type: 'requires' },
  { source: 'react', target: 'component', type: 'requires' },
  { source: 'component', target: 'props', type: 'requires' },
  { source: 'component', target: 'state', type: 'requires' },
  { source: 'javascript', target: 'state', type: 'requires' },
  { source: 'state', target: 'useState', type: 'requires' },
  { source: 'component', target: 'useState', type: 'requires' },
  { source: 'component', target: 'render', type: 'requires' },
  { source: 'state', target: 'render', type: 'requires' },
  { source: 'render', target: 'useEffect', type: 'requires' },
  { source: 'component', target: 'useEffect', type: 'requires' },
  { source: 'useEffect', target: 'dependencyArray', type: 'requires' },
  { source: 'render', target: 'dependencyArray', type: 'requires' },
  { source: 'react', target: 'component', type: 'semantic' },
  { source: 'props', target: 'state', type: 'semantic' },
];

export const demoClusters: MasterCluster[] = [
  {
    id: 'cluster-js-fundamentals',
    label: 'JavaScript Foundations',
    description: 'Core JavaScript concepts for understanding how the language processes code, manages declarations, and handles execution.',
    nodeIds: ['javascript', 'hoisting', 'scope', 'creationPhase', 'executionPhase', 'var', 'let', 'const', 'tdz', 'functionDecl'],
    keyNodeIds: ['javascript', 'scope', 'executionPhase', 'let'],
    recallSummary: { established: 5, weakening: 3, needsReview: 1, locked: 1 },
    status: 'mixed',
    x: 370, y: 220,
  },
  {
    id: 'cluster-js-variables',
    label: 'Variables & Scope',
    description: 'How JavaScript creates, accesses, scopes, and manages variable bindings.',
    nodeIds: ['binding', 'block', 'lexicalScope', 'functionScope', 'shadowing', 'closure', 'let', 'const', 'var', 'tdz'],
    keyNodeIds: ['binding', 'lexicalScope', 'shadowing', 'let'],
    recallSummary: { established: 5, weakening: 3, needsReview: 2, locked: 1 },
    status: 'mixed',
    x: 600, y: 680,
  },
  {
    id: 'cluster-js-functions',
    label: 'Functions & Closures',
    description: 'How functions create execution contexts and retain access to lexical environments.',
    nodeIds: ['functionExecution', 'parameters', 'returnValue', 'lexicalScope', 'closure', 'callback', 'higherOrderFunction'],
    keyNodeIds: ['functionExecution', 'closure', 'callback'],
    recallSummary: { established: 3, weakening: 2, needsReview: 2, locked: 0 },
    status: 'mixed',
    x: 1000, y: 760,
  },
  {
    id: 'cluster-js-async',
    label: 'Async JavaScript',
    description: 'How JavaScript coordinates delayed work through the event loop, tasks, promises, and async functions.',
    nodeIds: ['callStack', 'eventLoop', 'taskQueue', 'promise', 'microtaskQueue', 'asyncAwait', 'fetch', 'eventLoopInternals'],
    keyNodeIds: ['callStack', 'eventLoop', 'promise', 'asyncAwait'],
    recallSummary: { established: 3, weakening: 2, needsReview: 2, locked: 1 },
    status: 'mixed',
    x: 1580, y: 340,
  },
  {
    id: 'cluster-networking',
    label: 'Networking',
    description: 'Foundational networking concepts covering transport protocols, addressing, HTTP, and security.',
    nodeIds: ['tcp', 'udp', 'handshake', 'ports', 'ipAddress', 'dns', 'http', 'tls', 'packet'],
    keyNodeIds: ['tcp', 'http', 'tls'],
    recallSummary: { established: 4, weakening: 3, needsReview: 2, locked: 0 },
    status: 'mixed',
    x: 700, y: 1080,
  },
  {
    id: 'cluster-databases',
    label: 'Database Fundamentals',
    description: 'Relational database design covering normalization, querying, keys, joins, and transactions.',
    nodeIds: ['normalization', 'sql', 'indexing', 'table', 'primaryKey', 'foreignKey', 'join', 'transaction', 'acid'],
    keyNodeIds: ['sql', 'table', 'join', 'transaction'],
    recallSummary: { established: 4, weakening: 2, needsReview: 2, locked: 0 },
    status: 'mixed',
    x: 1280, y: 1350,
  },
  {
    id: 'cluster-react',
    label: 'React Fundamentals',
    description: 'Core React concepts for building components, managing state, and responding to changes.',
    nodeIds: ['react', 'component', 'props', 'state', 'useState', 'render', 'useEffect', 'dependencyArray'],
    keyNodeIds: ['react', 'component', 'state', 'useState', 'useEffect'],
    recallSummary: { established: 4, weakening: 3, needsReview: 1, locked: 0 },
    status: 'mixed',
    x: 1380, y: 510,
  },
];

export const demoNotes: Note[] = [
  {
    id: '1', title: 'JavaScript Fundamentals', status: 'completed',
    concepts: ['JavaScript', 'Hoisting', 'Scope', 'Creation Phase', 'var', 'let', 'TDZ'],
    claims: 14, connections: 8, updatedAt: '5 min ago',
    body: `# JavaScript Fundamentals

JavaScript is a high-level, interpreted language that runs in the browser and on Node.js. It is single-threaded but uses an event loop for asynchronous operations.

## Hoisting

Hoisting is JavaScript's behavior of moving declarations to the top of their scope during the **creation phase** of the execution context.

- **var** declarations are hoisted and initialized to \`undefined\`
- **let** and **const** are hoisted but remain in the Temporal Dead Zone (TDZ)
- **Function declarations** are fully hoisted — both name and body

## Scope

Scope determines the visibility and lifetime of variables.

- \`var\` is function-scoped, not block-scoped
- \`let\` and \`const\` are block-scoped
- Closures capture variables from outer scopes at definition time (lexical scope)

## Temporal Dead Zone

The TDZ is the period between the start of a block scope and the initialization of a let/const variable. Accessing a variable in its TDZ throws a ReferenceError.

## Key insight

The creation phase and execution phase are distinct. Understanding what happens in each phase explains hoisting, TDZ, and closure behavior.`,
  },
  {
    id: '2', title: 'Networking Basics', status: 'completed',
    concepts: ['TCP', 'UDP', 'Three-Way Handshake', 'Ports'],
    claims: 9, connections: 5, updatedAt: '2 hours ago',
    body: `# Networking Basics

## TCP vs UDP

**TCP** (Transmission Control Protocol) is connection-oriented and provides reliable, ordered delivery. It uses a three-way handshake to establish connections.

**UDP** (User Datagram Protocol) is connectionless and does not guarantee delivery. It has lower overhead, making it suitable for real-time applications like video streaming.

## Three-Way Handshake

TCP establishes a connection using three steps:
1. **SYN** — client sends a synchronize packet
2. **SYN-ACK** — server acknowledges and responds
3. **ACK** — client confirms, connection is established

## Ports

Ports are logical endpoints for network communication, numbered 0–65535.

- Well-known ports: 0–1023 (HTTP=80, HTTPS=443, SSH=22)
- Registered ports: 1024–49151
- Dynamic ports: 49152–65535`,
  },
  {
    id: '3', title: 'Database Design', status: 'completed',
    concepts: ['Normalization', 'SQL', 'Indexing'],
    claims: 8, connections: 4, updatedAt: '1 day ago',
    body: `# Database Design

## Normalization

Normalization organizes a relational database to reduce data redundancy and improve integrity.

- **1NF** — eliminate repeating groups; each cell holds one value
- **2NF** — remove partial dependencies on composite keys
- **3NF** — remove transitive dependencies (non-key columns depending on other non-key columns)

## SQL Fundamentals

SQL (Structured Query Language) is used to query and manipulate relational data.

- \`SELECT\` retrieves rows from a table
- \`JOIN\` combines rows from multiple tables on a condition
- \`WHERE\` filters rows; \`GROUP BY\` aggregates them

## Indexing

Indexes speed up data retrieval at the cost of additional storage and slower writes.

- **B-tree indexes** are the most common — good for range queries
- **Composite indexes** cover multiple columns and can satisfy multi-column WHERE clauses
- Over-indexing slows down INSERT/UPDATE/DELETE operations`,
  },
  {
    id: '4', title: 'React Hooks', status: 'draft',
    claims: 0, connections: 0, updatedAt: 'Just now',
    body: `# React Hooks

useState and useEffect are the two most fundamental hooks.

## useState

useState returns a state value and a setter. React re-renders the component when the setter is called with a new value.

## useEffect

useEffect runs after render. The dependency array controls when it re-runs.
- Empty array: runs once on mount
- With deps: runs when any dep changes
- No array: runs after every render

## Rules of Hooks

Hooks must be called at the top level — not inside loops, conditions, or nested functions. This allows React to preserve hook state between renders.`,
  },
];

export const demoUser = {
  name: 'Chirag',
  email: 'chirag@example.com',
  avatarInitial: 'C',
  memberSince: 'August 2026',
};

export const recallStatus = (recall: number | null) => {
  if (recall === null) return { label: 'No data', color: '#6B7280', bg: 'rgba(107,114,128,0.15)', symbol: '○' };
  if (recall >= 75) return { label: 'Healthy', color: '#58CC02', bg: 'rgba(88,204,2,0.15)', symbol: '✓' };
  if (recall >= 50) return { label: 'Weakening', color: '#FF9600', bg: 'rgba(255,150,0,0.15)', symbol: '△' };
  return { label: 'Needs Review', color: '#FF4B4B', bg: 'rgba(255,75,75,0.15)', symbol: '!' };
};
