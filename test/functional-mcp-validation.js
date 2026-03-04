/**
 * Functional validation of the C4X Parser — same core logic used by the MCP server.
 * Tests valid/invalid C4X syntax and self-correction feedback loop.
 */
const peg = require('../src/parser/c4x.generated.js');

function validate(code) {
    const hasGraph = /\bgraph\s+(TB|BT|LR|RL)\b/.test(code);
    let processed = code;
    if (!hasGraph) {
        const dm = /^\s*%%\{[^\n]*\}%%\s*/m.exec(code);
        if (dm) {
            const i = dm.index + dm[0].length;
            processed = code.slice(0, i) + 'graph TB\n' + code.slice(i);
        } else {
            processed = 'graph TB\n' + code;
        }
    }
    try {
        peg.parse(processed);
        return { valid: true };
    } catch (e) {
        return {
            valid: false,
            message: e.message,
            line: e.location && e.location.start ? e.location.start.line : 'unknown',
            col: e.location && e.location.start ? e.location.start.column : 'unknown'
        };
    }
}

let passed = 0;
let failed = 0;

function test(name, code, expectValid) {
    const r = validate(code);
    if (r.valid === expectValid) {
        console.log('PASS: ' + name + (r.valid ? '' : ' (error: ' + r.message.substring(0, 60) + ')'));
        passed++;
    } else {
        console.log('FAIL: ' + name + ' — expected ' + (expectValid ? 'valid' : 'invalid') + ', got ' + (r.valid ? 'valid' : 'error: ' + r.message));
        failed++;
    }
}

// --- Valid C4X Tests ---
test('Valid Person + Container + ContainerDb',
    '%%{ c4: container }%%\ngraph TB\n  Person(User, "Customer", "Uses the system")\n  Container(App, "Web App", "React")\n  ContainerDb(DB, "Database", "PostgreSQL")\n  User -->|Uses| App\n  App -->|Reads/Writes| DB', true);

test('Valid System Context',
    '%%{ c4: system-context }%%\ngraph TB\n  Person(User, "User", "Customer")\n  System(Bank, "Banking System", "Core banking")\n  System_Ext(Email, "Email System", "SendGrid")\n  User -->|Uses| Bank\n  Bank -->|Sends email| Email', true);

test('Valid Subgraph',
    '%%{ c4: container }%%\ngraph TB\n  Person(User, "User", "End user")\n  subgraph Backend {\n    Container(API, "API", "Node.js")\n    ContainerDb(DB, "Database", "PostgreSQL")\n  }\n  User -->|Calls| API\n  API -->|Queries| DB', true);

test('Valid Component',
    '%%{ c4: component }%%\ngraph TB\n  Component(Auth, "Auth Controller", "REST endpoint")\n  Component(Svc, "User Service", "Business logic")\n  Auth -->|Calls| Svc', true);

test('Valid dotted arrow',
    '%%{ c4: container }%%\ngraph TB\n  Person(User, "User", "End user")\n  Container(App, "App", "React")\n  User ..>|Async| App', true);

// --- Invalid C4X Tests ---
test('Invalid arrow syntax (->)',
    '%%{ c4: container }%%\ngraph TB\n  Person(User, "Customer", "Uses")\n  Container(App, "App", "React")\n  User -> App', false);

test('Missing comma in Person args',
    '%%{ c4: container }%%\ngraph TB\n  Person(User "Customer")', false);

// --- Feedback Loop Simulation ---
console.log('\n--- Feedback Loop Simulation ---');
const broken = '%%{ c4: container }%%\ngraph TB\n  Person(User "Customer")';
const r1 = validate(broken);
console.log('Parse 1 (broken): ' + (r1.valid ? 'valid' : 'ERROR: ' + r1.message.substring(0, 60)));
console.log('  Line: ' + r1.line + ', Column: ' + r1.col);

// Simulate AI applying the fix based on error feedback
const fixed = '%%{ c4: container }%%\ngraph TB\n  Person(User, "Customer", "End user")';
const r2 = validate(fixed);
console.log('Parse 2 (AI-corrected): ' + (r2.valid ? 'VALID — Self-correction loop works!' : 'Still broken'));

// Summary
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
