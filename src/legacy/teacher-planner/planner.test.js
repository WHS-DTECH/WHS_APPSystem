const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { createModuleRouter } = require('./app');
const { validKey, validContent } = require('./planner');
const { authReturn } = require('./authReturn');
const { standards, reflectionGroups, learningTypes } = require('./public/planner-reference');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { validSettings } = require('./schoolSettings');
const openingDates2026 = require('./public/opening-dates-2026');
const weeklyPrompts = require('./public/weekly-prompts');

test('school setup validates real same-year dates, ordered terms and typed events', () => {
  assert.equal(validSettings(2026, openingDates2026), true);
  assert.equal(openingDates2026.events.length, 8);
  assert.equal(openingDates2026.teacherFirstDay, undefined);
  assert.equal(openingDates2026.term1Start, undefined);
  assert.equal(validSettings(2027, openingDates2026), false);
  assert.equal(validSettings(2026, {term1Start:'2026-01-29',term1End:'2026-04-02',term2Start:'2026-04-20',events:[]}), true);
  for (const value of [
    {teacherFirstDay:'2026-02-30'}, {teacherFirstDay:2026}, {term1Start:'2026-04-03',term1End:'2026-04-02'},
    {term1End:'2026-04-02',term2Start:'2026-04-01'}, {owner_id:'forged'},
    {term1Start:'2026-04-02',term2Start:'2026-04-01'},
    {term1End:'2026-04-02',term2End:'2026-04-01'},
    {events:'bad'}, {events:[{date:'2026-01-28',kind:'unknown',label:'Title',details:''}]},
    {events:[{date:'2026-01-28',kind:'teacherOnly',label:'',details:''}]},
    {events:Array.from({length:81},()=>openingDates2026.events[0])}
  ]) assert.equal(validSettings(2026,value),false);
});

test('sign-in return accepts only local planner fragments, never external destinations', () => {
  const target = '/#section=goals&year=2026&week=2026-10-12&term=1';
  assert.equal(authReturn(target), target);
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/auth/global-control', '/#bad\nheader', '/#' + 'a'.repeat(181), [], undefined]) {
    assert.equal(authReturn(value), '/');
  }
});

test('planner validates years, Monday keys and real dates across year boundaries', () => {
  assert.equal(validKey(2026, 'week', '2026-10-12'), true);
  assert.equal(validKey(2026, 'week', '2026-10-13'), false);
  assert.equal(validKey(2026, 'week', '2026-02-30'), false);
  assert.equal(validKey(2026, 'week', '2025-12-29'), true);
  assert.equal(validKey(2026, 'week', '2027-01-04'), false);
  assert.equal(validKey(2026, 'term', '4'), true);
  assert.equal(validKey(2026, 'term', '5'), false);
  assert.equal(validKey(2026, 'goals', 'main'), true);
  assert.equal(validKey(2026, 'standards', 'main'), true);
  assert.equal(validKey(2026, 'assessmentSetup', 'main'), true);
  assert.equal(validKey(2026, 'standards', '1'), false);
  assert.equal(validKey(1999, 'year', 'main'), false);
  assert.equal(validKey(2026, 'unknown', 'main'), false);
});
test('planner rejects malformed fields and oversized data', () => {
  assert.equal(validContent('week', {term:'1',weekNumber:'-1',cells:{'p1:0':'Maths'},notes:'Test'}), true);
  for (const content of [{owner:'forged'}, {cells:[]}, {cells:{'p1:5':'bad'}}, {cells:{'p1:0':42}}, {term:'5'}, {notes:42}]) {
    assert.equal(validContent('week', content), false);
  }
  assert.equal(validContent('goals', {professional:'a'.repeat(20001)}), false);
  assert.equal(validContent('goals', {professional:'Original goal',annualDate8:'18 Oct',annualEvent8:'Event',priority1:'First',priority2:'Second',priority3:'Third'}),true);
  assert.equal(validContent('goals', {priority4:'Unexpected'}),false);
  assert.equal(validContent('goals', {annualEvent9:'Unexpected'}),false);
  assert.equal(validContent('term', {startDate:'2026-02-30'}), false);
  assert.equal(validContent('term', {startDate:'2026-04-01',endDate:'2026-03-01'}), false);
  assert.equal(validContent('learning', {entries:'Workshop\nReflection\nNext steps'}), true);
  assert.equal(standards.length, 8);
  const questions = reflectionGroups.flatMap(group => group.questions);
  assert.equal(questions.length, 15);
  const content = Object.fromEntries([
    ...standards.map((_, index) => ['focus' + (index + 1), 'Focus ' + index]),
    ...questions.map(([id]) => [id, 'Private reflection'])
  ]);
  assert.equal(Object.keys(content).length, 23);
  assert.equal(validContent('standards', content), true);
  for (const invalid of [{focus9:'invalid'}, {reflection16:'invalid'}, {focus1:7}, {reflection15:'a'.repeat(20001)}]) {
    assert.equal(validContent('standards', invalid), false);
  }
  assert.equal(learningTypes.length, 15);
  assert.equal(validContent('learning', {types:learningTypes.map(([id]) => id),applications:'Apply new learning',other:'Details',entries:'Old log'}), true);
  for (const types of ['workshops', ['unknown'], [1], ['reading', 'reading'], null]) {
    assert.equal(validContent('learning', {types}), false);
  }
  assert.equal(validContent('learning', {types:[]}), true);
  const savedStandard = { number:'92004', subject:'Digital Technologies', title:'Create a computer program',
    credits:'5 credits', assessment:'Internal', url:'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2024/as92004.pdf' };
  assert.equal(validContent('assessmentSetup', {selectedStandards:JSON.stringify([savedStandard])}), true);
  for (const standardsList of [
    [ {...savedStandard, url:'javascript:alert(1)'} ],
    [ {...savedStandard, number:'not-a-standard'} ],
    [ savedStandard, savedStandard ],
    Array.from({length:101}, (_, index) => ({...savedStandard, number:String(92000 + index)}))
  ]) assert.equal(validContent('assessmentSetup', {selectedStandards:JSON.stringify(standardsList)}), false);
  assert.equal(validContent('assessmentSetup', {selectedStandards:'not json'}), false);
});

test('period plans validate actual teaching dates, stable period keys and private fields', () => {
  for (const slot of ['p1', 'p2', 'p3', 'p4', 'p5']) assert.equal(validKey(2026, 'period', '2026-10-19_' + slot), true);
  for (const key of ['2026-10-17_p1', '2026-10-18_p1', '2026-02-30_p2', '2026-10-19_whanau',
    '2026-10-19_p6', '2026-10-19', '2026-10-19_p1_extra', '2025-12-31_p1']) {
    assert.equal(validKey(2026, 'period', key), false, key);
  }
  assert.equal(validKey(2027, 'period', '2027-01-01_p5'), true);
  assert.equal(validContent('period', { title: 'Resource preparation', priorities: 'Prepare materials',
    activities: '10 minutes: organise', resources: 'https://docs.google.com/example', reflection: 'Next steps' }), true);
  assert.equal(validContent('period', {}), true);
  for (const content of [{ title: 7 }, { title: 'a'.repeat(201) }, { owner_id: 'forged' },
    { classId: 'changes-with-timetable' }, { activities: 'a'.repeat(20001) }, { cells: {} }]) {
    assert.equal(validContent('period', content), false);
  }
});

test('activity keys and period links validate without changing legacy period notes', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(validKey(2026, 'activity', id), true);
  for (const key of ['main', 'bad', '../activity', '2026-10-30_p1']) assert.equal(validKey(2026, 'activity', key), false);
  assert.equal(validContent('activity', { title: 'SketchUp', priorities: 'Draw a cube', instructions: 'Build a roof',
    lessonPlans: 'Session 1: cube\nSession 2: roof', resources: 'https://example.test', reflection: 'Next steps' }), true);
  assert.equal(validContent('activity', { title: 'x'.repeat(201) }), false);
  assert.equal(validContent('activity', { lessonPlans: 'x'.repeat(20001) }), false);
  assert.equal(validContent('activity', { owner_id: id }), false);
  assert.equal(validContent('period', { activities: 'Original free text' }), true);
  assert.equal(validContent('period', { activities: 'Keep notes', activityLinks: JSON.stringify([{ id, title: 'SketchUp' }]) }), true);
  for (const links of ['not json', '{}', JSON.stringify([null]), JSON.stringify([{ id: 'bad', title: 'Test' }]),
    JSON.stringify([{ id, title: '' }]), JSON.stringify([{ id, title: ' ' }]), JSON.stringify([{ id, title: 'x'.repeat(201) }]),
    JSON.stringify([{ id, title: 'Test', lessonPlans: 'Wrong place' }]),
    JSON.stringify([{ id, title: 'One' }, { id, title: 'Duplicate' }])]) {
    assert.equal(validContent('period', { activityLinks: links }), false);
  }
});

test('activity API persists owner-private year-scoped plans with CSRF and revision protection', async t => {
  const { createModuleRouter } = require('./app');
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const records = new Map(), calls = [];
  const app = express();
  app.use(session({ secret: 'synthetic-activity-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    if (req.get('x-test-user')) req.user = { id: req.get('x-test-user'), roles: ['Teacher'] };
    next();
  });
  app.use(createModuleRouter({ query: async (sql, params) => {
    calls.push(sql);
    if (sql.includes("section='period'")) {
      if (sql.includes('ORDER BY entry_key DESC')) {
        assert.match(sql, /owner_id=\$1 AND year=\$2/);
        return { rows: [...records.entries()].filter(([key]) => key.startsWith(params[0] + ':' + params[1] + ':period:'))
          .map(([key, data]) => ({ entry_key: key.split(':').at(-1), title: data.content.title || null })) };
      }
      assert.match(sql, /content->>'activityLinks' AS "activityLinks"/);
      assert.match(sql, /owner_id=\$1/);
      return { rows: [...records.entries()].filter(([key]) =>
        key.startsWith(params[0] + ':') && key.includes(':period:') &&
        key.split(':').at(-1) >= params[1] && key.split(':').at(-1) < params[2])
        .map(([key, data]) => ({ entry_key: key.split(':').at(-1), title: data.content.title || null,
          activityLinks: data.content.activityLinks || null })) };
    }
    if (sql.includes("section='activity'")) {
      assert.match(sql, /owner_id=\$1 AND year=\$2/);
      return { rows: [...records.entries()].filter(([key]) => key.startsWith(params[0] + ':' + params[1] + ':activity:'))
        .map(([key, data]) => ({ entry_key: key.split(':').at(-1), title: data.content.title })) };
    }
    const key = params.slice(0, 4).join(':'), existing = records.get(key);
    if (sql.startsWith('SELECT')) return { rows: existing ? [existing] : [] };
    if (sql.startsWith('INSERT') && existing || sql.startsWith('UPDATE') && (!existing || existing.revision !== params[5])) return { rows: [] };
    const data = { content: JSON.parse(params[4]), revision: (existing?.revision || 0) + 1, updated_at: new Date().toISOString() };
    records.set(key, data);
    return { rows: [{ revision: data.revision, updated_at: data.updated_at }] };
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  assert.equal((await fetch(base + 'activities/2026')).status, 401);
  const response = await fetch(base + 'session', { headers: { 'x-test-user': owner } });
  const cookie = response.headers.get('set-cookie').split(';')[0], { csrf } = await response.json();
  const headers = { 'x-test-user': owner, cookie, 'Content-Type': 'application/json', 'x-planner-csrf': csrf };
  const put = (path, content, revision = 0, overrides = {}) => fetch(base + path, {
    method: 'PUT', headers: { ...headers, ...overrides }, body: JSON.stringify({ content, revision })
  });
  const path = '2026/activity/' + id, content = { title: 'SketchUp', lessonPlans: 'Draw cubes and roofs', resources: 'https://example.test' };
  assert.equal((await put(path, content, 0, { 'x-planner-csrf': 'forged' })).status, 403);
  assert.equal((await put(path, content)).status, 200);
  assert.deepEqual((await (await fetch(base + path, { headers })).json()).content, content);
  assert.equal((await put(path, { ...content, title: 'Updated' }, 1)).status, 200);
  assert.equal((await put(path, content, 1)).status, 409);
  assert.equal((await put(path, content)).status, 409);
  assert.equal((await put(path, content, 2, { 'x-test-user': other })).status, 409);
  assert.equal((await put('2026/activity/main', content)).status, 400);
  const listing = await fetch(base + 'activities/2026', { headers });
  assert.equal(listing.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await listing.json(), { activities: [{ entry_key: id, title: 'Updated' }] });
  assert.deepEqual(await (await fetch(base + 'activities/2027', { headers })).json(), { activities: [] });
  assert.deepEqual(await (await fetch(base + 'activities/2026?owner_id=' + owner, { headers: { ...headers, 'x-test-user': other } })).json(), { activities: [] });
  assert.deepEqual((await (await fetch(base + path, { headers: { ...headers, 'x-test-user': other } })).json()).content, {});
  assert.equal((await fetch(base + 'activities/1999', { headers })).status, 400);
  const links = JSON.stringify([{ id, title: 'SketchUp' }]);
  assert.equal((await put('2026/period/2026-10-30_p1', { activities: 'Class-specific notes', activityLinks: links })).status, 200);
  assert.equal((await put('2026/period/2026-10-30_p2', { activities: 'Other class notes', activityLinks: links })).status, 200);
  const summaries = await (await fetch(base + 'period-plans/2026-10-26', { headers })).json();
  assert.equal(summaries.plans.length, 2);
  assert.equal(summaries.plans[0].activityLinks, links);
  const choices = await fetch(base + 'period-plan-choices/2026', { headers });
  assert.equal(choices.headers.get('cache-control'), 'no-store');
  assert.equal((await choices.json()).plans.length, 2);
  assert.deepEqual(await (await fetch(base + 'period-plan-choices/2027', { headers })).json(), { plans: [] });
  assert.deepEqual(await (await fetch(base + 'period-plan-choices/2026?owner_id=' + owner, {
    headers: { ...headers, 'x-test-user': other }
  })).json(), { plans: [] });
  assert.equal((await fetch(base + 'period-plan-choices/1999', { headers })).status, 400);
  assert.equal((await fetch(base + 'period-plan-choices/2026')).status, 401);
  assert.deepEqual(await (await fetch(base + 'period-plans/2026-10-26', {
    headers: { ...headers, 'x-test-user': other }
  })).json(), { plans: [] });
  assert.equal((await put('2026/period/2026-10-30_p1', { activities: 'Class-specific notes', activityLinks: '[]' }, 1)).status, 200);
  assert.equal((await (await fetch(base + path, { headers })).json()).content.lessonPlans, content.lessonPlans);
  for (const sql of calls.filter(sql => !sql.startsWith('INSERT'))) assert.match(sql, /owner_id=\$1/);
});

test('standalone sign-in returns to the selected planner view and refreshes the session token', {
  skip: !process.env.PLANNER_TEST_DATABASE_URL
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planner-auth-test-'));
  const pool = new Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, ssl: false });
  const schema = 'planner_auth_' + crypto.randomUUID().replaceAll('-', '');
  let child;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const database = new URL(process.env.PLANNER_TEST_DATABASE_URL);
    database.searchParams.set('options', '-c search_path=' + schema);
    const env = {...process.env,NODE_ENV:'test',PORT:'0',DATABASE_URL:database.href,DATABASE_SSL:'false',
      SESSION_SECRET:'standalone-auth-fixture-only',GLOBAL_CONTROL_URL:'https://core.example.test',
      MODULE_CLIENT_ID:'teacher-planner:development',APP_BASE_URL:'https://fixture.onrender.com'};
    await promisify(execFile)(process.execPath, [path.join(__dirname, 'migrate.js')], { env });
    const preload = path.join(directory, 'core-fixture.cjs');
    await fs.writeFile(preload, `global.fetch=async(url,options)=>{
      if(String(url).endsWith('/token')) return Response.json({access_token:'A'.repeat(43)});
      if(String(url).endsWith('/school-calendar')) return Response.json({year:JSON.parse(options.body).year,available:false,terms:[],holidays:[]});
      return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.test',roles:['Teacher']});
    };`);
    child = spawn(process.execPath, ['--require', preload, path.join(__dirname, 'server.js')], {
      env,
      stdio:['ignore','pipe','pipe']
    });
    const base = await new Promise((resolve,reject)=>{
      let output='',errors='';
      const timer=setTimeout(()=>reject(new Error('Server startup timed out: '+errors)),15000);
      child.stderr.on('data',data=>errors+=data);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('Server stopped: '+errors));});
      child.stdout.on('data',data=>{
        output+=data;
        const port=output.match(/Module listening on port (\d+)/);
        if(port){clearTimeout(timer);resolve('http://127.0.0.1:'+port[1]);}
      });
    });
    const destination='/#section=goals&year=2026&week=2026-10-12&term=1';
    let response=await fetch(base+'/auth/global-control?next='+encodeURIComponent(destination),{redirect:'manual'});
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const state=new URL(response.headers.get('location')).searchParams.get('state');
    response=await fetch(base+'/auth/global-control/callback?'+new URLSearchParams({state,code:'C'.repeat(43)}),
      {redirect:'manual',headers:{cookie}});
    assert.equal(response.status,302);
    assert.equal(response.headers.get('location'),destination);
    const renewed=response.headers.get('set-cookie').split(';')[0];
    assert.notEqual(renewed,cookie);
    response=await fetch(base+'/api/planner/session',{headers:{cookie:renewed}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.userId,'11111111-1111-4111-8111-111111111111');
    assert.equal(body.canManageSchoolSettings,false);
    const nav=await (await fetch(base+'/nav-data',{headers:{cookie:renewed}})).json();
    assert.equal(nav.isAdmin,false);
    assert.match(body.csrf,/^[a-f0-9]{64}$/);
    const calendarResponse=await fetch(base+'/api/school-calendar/2027',{headers:{cookie:renewed}});
    const calendarBody=await calendarResponse.json();
    assert.equal(calendarResponse.status,200,JSON.stringify(calendarBody));
    assert.equal(calendarBody.year,2027);
    assert.equal((await fetch(base+'/api/school-calendar/1900',{headers:{cookie:renewed}})).status,400);
    assert.equal((await fetch(base+'/api/school-calendar/2026',{redirect:'manual'})).status,401);
    assert.equal((await fetch(base+'/api/planner/session',{redirect:'manual'})).status,401);
  } finally {
    if(child && child.exitCode===null) await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
    try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await pool.end(); }
    await fs.rm(directory,{recursive:true});
  }
});

test('real database persists every planner section, isolates users including administrators and detects conflicting saves', {
  skip: !process.env.PLANNER_TEST_DATABASE_URL
}, async (t) => {
  const pool = new Pool({connectionString:process.env.PLANNER_TEST_DATABASE_URL,ssl:false});
  const schema = 'planner_' + crypto.randomUUID().replaceAll('-','');
  const client = await pool.connect();
  let server;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of ['001_initial.sql','002_planner.sql']) {
      await client.query(await fs.readFile(path.join(__dirname,'db','migrations',name),'utf8'));
    }
    const legacyOwner = crypto.randomUUID();
    await client.query(`INSERT INTO planner_sections(owner_id,year,section,entry_key,content)
      VALUES ($1,2025,'goals','main',$2),($1,2025,'learning','main',$3)`,
    [legacyOwner, JSON.stringify({standards:'Existing evidence'}), JSON.stringify({entries:'Existing log'})]);
    for (const name of (await fs.readdir(path.join(__dirname,'db','migrations'))).filter(name => name.endsWith('.sql') && name > '002_planner.sql').sort()) {
      await client.query(await fs.readFile(path.join(__dirname,'db','migrations',name),'utf8'));
    }
    const legacy = await client.query('SELECT section,content,revision FROM planner_sections WHERE owner_id=$1 ORDER BY section', [legacyOwner]);
    assert.deepEqual(legacy.rows, [
      {section:'goals',content:{standards:'Existing evidence'},revision:1},
      {section:'learning',content:{entries:'Existing log'},revision:1}
    ]);
    let user = {id:crypto.randomUUID(),roles:['Teacher']};
    const owner = user;
    const otherAdmin = {id:crypto.randomUUID(),roles:['ADMIN']};
    const app = express();
    app.use(session({secret:'planner-fixture-only',saveUninitialized:false,resave:false}));
    app.use((req,res,next)=>{req.user=user;next();});
    app.use('/',createModuleRouter({query:(sql,values)=>client.query(sql,values)}));
    app.use((error,req,res,next)=>{console.error(error);res.status(500).json({error:'Fixture request failed'});});
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const sessionResponse=await fetch(base+'/api/planner/session');
    const cookie=sessionResponse.headers.get('set-cookie').split(';')[0];
    const sessionData=await sessionResponse.json();
    const csrf=sessionData.csrf;
    assert.equal(sessionData.userId,owner.id);
    assert.equal(sessionData.canManageSchoolSettings,false);
    const get=route=>fetch(base+'/api/planner/'+route,{headers:{cookie}});
    const put=(route,content,revision=0,token=csrf)=>fetch(base+'/api/planner/'+route,{
      method:'PUT',headers:{cookie,'Content-Type':'application/json','x-planner-csrf':token},
      body:JSON.stringify({content,revision,owner_id:owner.id})
    });
    const timetableUrl='https://westlandhigh.school.kiwi/ics/TEST-OWNERONLY.ics';
    const setTimetable=(url,revision=0,token=csrf)=>fetch(base+'/api/planner/kamar-timetable',{
      method:'PUT',headers:{cookie,'Content-Type':'application/json','x-planner-csrf':token},
      body:JSON.stringify({subscription_url:url,revision,owner_id:owner.id})
    });
    assert.equal((await get('kamar-timetable/2026/10')).status,409);
    assert.equal((await setTimetable(timetableUrl,0,'wrong')).status,403);
    for(const invalid of [
      'http://westlandhigh.school.kiwi/ics/TEST-OWNERONLY.ics',
      'https://evil.test/ics/TEST-OWNERONLY.ics',
      'https://westlandhigh.school.kiwi/ics/school.ics',
      timetableUrl+'?redirect=1', timetableUrl+'#fragment'
    ]) assert.equal((await setTimetable(invalid)).status,400);
    assert.equal((await setTimetable(timetableUrl)).status,200);
    assert.equal((await setTimetable(timetableUrl)).status,409);
    const savedTimetable = await (await get('kamar-timetable')).json();
    assert.equal(savedTimetable.subscription_url,timetableUrl);
    assert.equal(savedTimetable.revision,1);
    user=otherAdmin;
    assert.equal((await (await get('kamar-timetable?owner_id='+owner.id)).json()).subscription_url,'');
    assert.equal((await get('kamar-timetable/2026/10?owner_id='+owner.id)).status,409);
    assert.equal((await setTimetable('',1)).status,409);
    user=owner;
    const actualFetch=globalThis.fetch;
    let feedRequests=0;
    const feedMock=t.mock.method(globalThis,'fetch',async (url,options)=>{
      if(url!==timetableUrl) return actualFetch(url,options);
      assert.equal(options.redirect,'error');
      feedRequests++;
      if(feedRequests===2) throw new Error('Private upstream error including '+timetableUrl);
      return new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:lesson\r\nDTSTART:20261019T200000Z\r\nDTEND:20261019T210000Z\r\nSUMMARY:Private lesson\r\nEND:VEVENT\r\nEND:VCALENDAR');
    });
    const lessons=await (await get('kamar-timetable/2026/10')).json();
    assert.equal(lessons.events[0].title,'Private lesson');
    assert.ok(!JSON.stringify(lessons).includes(timetableUrl));
    const failedTimetable=await get('kamar-timetable/2026/10');
    assert.equal(failedTimetable.status,502);
    assert.ok(!(await failedTimetable.text()).includes(timetableUrl));
    assert.equal((await get('kamar-timetable/2026/13')).status,400);
    feedMock.mock.restore();
    assert.equal((await setTimetable('',1)).status,200);
    assert.equal((await get('kamar-timetable/2026/10')).status,409);
    assert.equal((await (await get('kamar-timetable')).json()).subscription_url,'');
    assert.equal((await setTimetable(timetableUrl,1)).status,409);
    assert.equal((await put('school-settings/2026',openingDates2026)).status,403);
    assert.equal((await get('school-settings/1900')).status,400);
    assert.equal((await get('school-settings/2026')).status,200);
    assert.equal((await (await get('school-settings/2026')).json()).canEdit,false);
    user=otherAdmin;
    assert.equal((await put('school-settings/2026',openingDates2026,0,'wrong')).status,403);
    assert.equal((await put('school-settings/2026',{teacherFirstDay:'2027-01-01'})).status,400);
    assert.equal((await put('school-settings/2026',openingDates2026)).status,200);
    assert.equal((await put('school-settings/2026',openingDates2026)).status,409);
    user=owner;
    assert.deepEqual((await (await get('school-settings/2026')).json()).content,openingDates2026);
    assert.equal((await (await get('school-settings/2026')).json()).canEdit,false);
    assert.deepEqual((await (await get('school-settings/2027')).json()).content,{});
    assert.equal((await put('school-settings/2026',{},1)).status,403);
    user=otherAdmin;
    assert.equal((await put('school-settings/2026',{...openingDates2026,term1Start:'2026-01-29',term1End:'2026-04-02'},1)).status,200);
    assert.equal((await put('school-settings/2026',{},1)).status,409);
    user=owner;
    assert.equal((await (await get('school-settings/2026')).json()).content.term1Start,'2026-01-29');
    for (const role of ['teacher','technician','lead-teacher']) {
      user={id:crypto.randomUUID(),roles:['Teacher'],module_roles:[role]};
      const response=await put('school-settings/2028',{events:[]});
      assert.equal(response.status,role==='lead-teacher'?200:403);
      assert.equal((await (await get('school-settings/2028')).json()).canEdit,role==='lead-teacher');
      assert.deepEqual((await (await get('2026/week/2026-10-12')).json()).content,{});
    }
    user=owner;
    for(const [route,content] of [
      ['2026/period/2026-10-12_p1',{title:'Private preparation',priorities:'Organise resources',activities:'Prepare without classes',resources:'https://example.test/resource',reflection:'Private reflection'}],
      ['2026/activity/cccccccc-cccc-4ccc-8ccc-cccccccccccc',{title:'Reusable activity',instructions:'Private instructions',lessonPlans:'Private lesson plans',resources:'https://example.test/activity'}],
      ['2026/week/2026-10-12',{...weeklyPrompts['4-1'],focus:'Private focus',reflection:'',cells:{'p1:0':'Private lesson'}}],
      ['2026/year/main',{priorities:'Private priority'}],
      ['2026/term/1',{startDate:'2026-01-26',information:'Private term',priorities:'Private priorities',reflection:'Previously saved reflection'}],
      ['2026/goals/main',{wellbeing:'Private wellbeing',professional:'Existing goal',annualDate8:'18 Oct',annualEvent8:'Private event',priority1:'One',priority2:'Two',priority3:'Three'}],
      ['2026/standards/main',Object.fromEntries([
        ...standards.map((_, index) => ['focus' + (index + 1), 'Private focus ' + index]),
        ...reflectionGroups.flatMap(group => group.questions.map(([id]) => [id, 'Private ' + id]))
      ])],
      ['2026/learning/main',{entries:'Private log',types:learningTypes.map(([id]) => id),other:'Private details',applications:'Private application'}]
    ]) {
      assert.equal((await put(route,content)).status,200);
      assert.deepEqual((await (await get(route)).json()).content,content);
      user=otherAdmin;
      assert.deepEqual((await (await get(route)).json()).content,{});
      user={id:crypto.randomUUID(),roles:['Teacher'],module_roles:['lead-teacher']};
      assert.deepEqual((await (await get(route)).json()).content,{});
      assert.equal((await put(route,{...content},1)).status,409);
      user=owner;
    }
    assert.equal((await put('2026/period/2026-10-12_p1',{title:'Updated plan'},1,'wrong')).status,403);
    assert.equal((await put('2026/period/2026-10-17_p1',{title:'Weekend'})).status,400);
    assert.equal((await put('2026/period/2026-10-12_p2',{title:'a'.repeat(201)})).status,400);
    assert.equal((await put('2026/period/2026-10-12_p1',{title:'Updated plan'},1)).status,200);
    assert.equal((await put('2026/period/2026-10-12_p1',{title:'Stale plan'},1)).status,409);
    assert.deepEqual(await (await get('period-plans/2026-10-12')).json(), {
      plans:[{entry_key:'2026-10-12_p1',title:'Updated plan',activityLinks:null}]
    });
    assert.equal((await get('period-plans/2026-10-13')).status,400);
    for (const identity of [otherAdmin, {...owner,id:crypto.randomUUID(),module_roles:['lead-teacher']}]) {
      user=identity;
      assert.deepEqual(await (await get('period-plans/2026-10-12?owner_id='+owner.id)).json(),{plans:[]});
    }
    user=owner;
    assert.equal((await put('2026/period/2026-12-31_p5',{title:'Last year plan'})).status,200);
    assert.equal((await put('2027/period/2027-01-01_p2',{title:'New year plan'})).status,200);
    assert.equal((await put('2027/period/2027-01-04_p1',{title:'Following week'})).status,200);
    assert.deepEqual(await (await get('period-plans/2026-12-28')).json(), {plans:[
      {entry_key:'2026-12-31_p5',title:'Last year plan',activityLinks:null}, {entry_key:'2027-01-01_p2',title:'New year plan',activityLinks:null}
    ]});
    assert.equal((await (await get('2026/week/2026-10-12')).json()).content.cells['p1:0'],'Private lesson',
      'period plans do not replace weekly quick notes');
    const termEntry = (await (await get('2026/term/1')).json()).content;
    assert.equal((await put('2026/term/1',{...termEntry,information:'Autosaved term information',priorities:'Autosaved priorities'},1)).status,200);
    const persistedTerm = await client.query(`SELECT content,revision FROM planner_sections
      WHERE owner_id=$1 AND year=2026 AND section='term' AND entry_key='1'`, [owner.id]);
    assert.equal(persistedTerm.rows[0].content.information,'Autosaved term information');
    assert.equal(persistedTerm.rows[0].content.priorities,'Autosaved priorities');
    assert.equal(persistedTerm.rows[0].content.reflection,'Previously saved reflection');
    assert.equal(persistedTerm.rows[0].revision,2);
    assert.equal((await put('2026/term/1',{...termEntry,information:'Stale autosave'},1)).status,409);
    assert.deepEqual((await (await get('2027/standards/main')).json()).content,{});
    assert.equal((await put('2026/standards/main',{focus1:'Updated focus',reflection15:'Next steps'},1)).status,200);
    assert.equal((await put('2026/standards/main',{focus1:'Stale edit'},1)).status,409);
    assert.equal((await put('2026/learning/main',{types:[],entries:'Private log',applications:'Changed application'},1)).status,200);
    assert.deepEqual((await (await get('2026/learning/main')).json()).content.types,[]);
    assert.equal((await put('2026/goals/main',{wellbeing:'Fresh edit'},0)).status,409);
    assert.equal((await put('2026/goals/main',{wellbeing:'Fresh edit'},1)).status,200);
    assert.equal((await put('2026/goals/main',{wellbeing:'Stale overwrite'},1)).status,409);
    assert.equal((await put('2026/goals/main',{wellbeing:'CSRF attack'},2,'forged')).status,403);
    assert.equal((await put('2026/goals/main',{wellbeing:42},2)).status,400);
    assert.equal((await fetch(base+'/api/planner/2026/goals/main', {
      method:'DELETE',headers:{cookie,'x-planner-csrf':csrf}
    })).status,405);
    assert.equal((await get('2026/week/2026-02-30')).status,400);
    user=otherAdmin;
    assert.equal((await put('2026/goals/main',{wellbeing:'Admin own entry'})).status,200);
    user=owner;
    assert.equal((await (await get('2026/goals/main')).json()).content.wellbeing,'Fresh edit');
    assert.deepEqual((await (await get('2027/goals/main')).json()).content,{});
    // Confirm persistence directly, independently of the HTTP response.
    const persisted=await client.query('SELECT content FROM planner_sections WHERE owner_id=$1 AND section=$2',[owner.id,'goals']);
    assert.equal(persisted.rows[0].content.wellbeing,'Fresh edit');
    user=undefined;
    assert.equal((await get('2026/goals/main')).status,401);
    assert.equal((await get('period-plans/2026-10-12')).status,401);
    user={id:owner.id,roles:['Student']};
    assert.equal((await get('2026/goals/main')).status,403);
    assert.equal((await get('period-plans/2026-10-12')).status,403);
    user={id:owner.id,roles:['ADMIN'],is_active:false};
    assert.equal((await get('2026/goals/main')).status,403);
    assert.equal((await get('period-plans/2026-10-12')).status,403);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();await pool.end();
  }
});
