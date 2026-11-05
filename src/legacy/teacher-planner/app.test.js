const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const vm = require('node:vm');
const { createModuleRouter } = require('./app');
const { renderShell } = require('./shell');
const reference = require('./public/planner-reference');

test('weekly meeting, away, notes and phone labels match the original planner', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const context = {};
  vm.runInNewContext(source.slice(source.indexOf('  const slots = ['), source.indexOf('  let year =')) +
    '\nglobalThis.labels = { slots, fields };', context);
  assert.equal(context.labels.slots.find(slot => slot[0] === 'meetings')[1], 'I muri i ngā hui mahi | after work meetings');
  assert.equal(context.labels.slots.find(slot => slot[0] === 'away')[1], 'Tamō atu i te mahi | away from work');
  assert.equal(context.labels.fields.week.find(field => field[0] === 'notes')[1], 'Ōku whakamahara | Notes');
  assert.equal(context.labels.fields.week.find(field => field[0] === 'calls')[1], 'Waea waea | phone calls:');
});

test('shared save and feedback are above every page and external save targets the planner form', () => {
  const html=renderShell({baseUrl:'/',coreUrl:'',standalone:false});
  const controls=html.indexOf('class="planner-page-controls"');
  const selectors=html.indexOf('id="planner-selectors"');
  const feedback=html.indexOf('class="planner-feedback"');
  const save=html.indexOf('id="save-planner"');
  const status=html.indexOf('id="planner-status"');
  const form=html.indexOf('<form id="planner-form">');
  assert.ok(controls<selectors && selectors<feedback && feedback<save && save<status && status<form);
  assert.match(html,/<button type="submit" form="planner-form" id="save-planner"/);
  assert.equal([...html.matchAll(/id="save-planner"/g)].length,1);
});
test('default term uses current term and most recently finished term during holidays', async () => {
  const source=await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helper=source.slice(source.indexOf('  function termRanges('),source.indexOf('  async function loadTermDates('));
  const context={};
  vm.runInNewContext(helper,context);
  const terms=[
    {term:1,startDate:'2026-01-26',endDate:'2026-04-02'},
    {term:2,startDate:'2026-04-20',endDate:'2026-07-03'},
    {term:3,startDate:'2026-07-20',endDate:'2026-09-25'},
    {term:4,startDate:'2026-10-12',endDate:'2026-12-18'}
  ];
  const ranges=context.termRanges({},terms);
  for(const [day,term] of [['2026-01-25',''],['2026-01-26','1'],['2026-04-02','1'],['2026-04-15','1'],
    ['2026-04-20','2'],['2026-07-10','2'],['2026-10-01','3'],['2026-10-18','4'],['2026-12-31','4']])
    assert.equal(context.defaultTerm(ranges,day),term,day);
  const overrides=context.termRanges({term4Start:'2026-10-19'},terms);
  assert.equal(context.defaultTerm(overrides,'2026-10-18'),'3');
  assert.equal(context.defaultTerm(overrides,'2026-10-19'),'4');
  assert.equal(context.defaultTerm([], '2026-10-18'),'');
});

test('weekly controls show loading state and move forwards/backwards across month and year boundaries', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const helpers = source.slice(source.indexOf('  function updateWeekNavigation('), source.indexOf('  function setCalendarEvents('));
  const el = (tag, textContent = '', attrs = {}) => ({
    tag, textContent, attrs, children: [], disabled: false,
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(event, handler) { this[event] = handler; }
  });
  const walk = node => [node, ...node.children.flatMap(walk)];
  const selectors = el('div'), messages = [], loadedWeeks = [];
  selectors.querySelectorAll = () => walk(selectors).filter(node => ['input', 'button'].includes(node.tag));
  const context = {
    el, selectors, section: 'week', term: '4', year: 2026, week: '2026-10-26', busy: true,
    date: value => new Date(value + 'T00:00:00Z'), iso: value => value.toISOString().slice(0, 10),
    canLeave: () => !context.busy, notice: message => messages.push(message),
    load: () => loadedWeeks.push(context.week)
  };
  vm.runInNewContext(helpers, context);
  context.renderSelectors();
  const [picker, previous, next] = selectors.querySelectorAll();
  assert.ok([picker, previous, next].every(control => control.disabled));
  assert.equal(selectors.attrs['aria-busy'], 'true');
  next.click();
  assert.equal(loadedWeeks.length, 0);
  context.busy = false;
  context.updateWeekNavigation();
  assert.ok([picker, previous, next].every(control => !control.disabled));
  assert.equal(selectors.attrs['aria-busy'], 'false');
  next.click();
  assert.equal(context.week, '2026-11-02');
  previous.click();
  assert.equal(context.week, '2026-10-26');
  context.week = '2026-01-05';
  previous.click();
  assert.equal(context.week, '2025-12-29', 'week spanning selected year remains accessible');
  previous.click();
  assert.equal(context.week, '2025-12-29');
  context.week = '2026-12-28';
  next.click();
  assert.equal(context.week, '2026-12-28');
  assert.equal(messages.length, 2, 'cross-year limits are reported explicitly');
});

test('weekly navigation is disabled throughout saving and restored after success or failure', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const helper = source.slice(source.indexOf('  function updateWeekNavigation('), source.indexOf('  function renderSelectors('));
  const saver = source.slice(source.indexOf('  async function saveEntry('), source.indexOf('  async function ensureSaved('));
  for (const fail of [false, true]) {
    const controls = [{}, {}, {}];
    let finishSession;
    const session = new Promise(resolve => { finishSession = resolve; });
    const context = {
      section: 'week', busy: false, loaded: true, dirty: true, editVersion: 0, revision: 1,
      selectors: { querySelectorAll: () => controls, setAttribute() {} },
      form: { reportValidity: () => true }, FormData: class { *[Symbol.iterator]() {} },
      content: { querySelectorAll: () => [] }, save: {}, csrf: 'fixture',
      clearTimeout, autosaveTimer: undefined, notice() {}, autosaves: () => true, scheduleAutosave() {},
      refreshSession: () => session, address: () => '/week/2026-10-26',
      request: async () => {
        if (fail) throw new Error('Save unavailable');
        return { revision: 2, updated_at: '2026-10-30T01:00:00Z' };
      },
      console: { error() {} }
    };
    vm.runInNewContext(helper + saver, context);
    const saving = context.saveEntry(true);
    assert.ok(controls.every(control => control.disabled));
    finishSession();
    assert.equal(await saving, !fail);
    assert.ok(controls.every(control => !control.disabled));
    assert.equal(context.dirty, fail, 'failed saves retain unsaved edits');
  }
});

test('normal opening resolves a term before loading its private entry, while direct links are preserved', async () => {
  const source=await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helper=source.slice(source.indexOf('  function defaultTerm('),source.indexOf('  async function loadTermDates('));
  const loader=source.slice(source.indexOf('  async function load()'),source.indexOf('  function expandTermArea('));
  for(const mode of ['current','holiday','january','direct','term-default','term-explicit','legacy-attendance','unavailable','failure']){
    const ranges=[
      {term:'1',startDate:'2026-01-26',endDate:'2026-04-02'},
      {term:'2',startDate:'2026-04-20',endDate:'2026-07-03'},
      {term:'3',startDate:'2026-07-20',endDate:'2026-09-25'},
      {term:'4',startDate:'2026-10-12',endDate:'2026-12-18'}
    ];
    const nodes={};
    const requested=[],rendered=[],years=[],navigationBusy=[];
    const context={
      clearTimeout,autosaveTimer:undefined,scheduleAutosave(){},
      openingTermPending:!['direct','term-default','term-explicit','legacy-attendance'].includes(mode),
      termSelectionPending:mode!=='term-explicit',
      section:mode.startsWith('term-')?'term':mode==='direct'?'goals':mode==='legacy-attendance'?'attendanceImport':'cover',year:2026,term:'1',
      localDate:mode==='holiday'?'2026-10-01':mode==='january'?'2026-01-05':'2026-10-18',
      save:{},retry:{},signin:{hidden:true},content:{replaceChildren(){}},yearInput:{},
      document:{querySelector:()=>({}),querySelectorAll:()=>[],getElementById:id=>nodes[id]||(nodes[id]={})},
      renderSelectors(){},updateYearBadge(){},history:{replaceState(){}},viewFragment:()=>'',notice(){},refreshSession:async()=>{},console:{error(){}},
      updateWeekNavigation(){navigationBusy.push(context.busy);},
      loadTermDates:async year=>{
        years.push(year);
        if(mode==='failure')throw new Error('Source unavailable');
        return {ranges:mode==='unavailable'?[]:year===2025?[{term:'4',startDate:'2025-10-06',endDate:'2025-12-19'}]:ranges};
      },
      request:async url=>{requested.push(url);return {revision:0,content:{}};},
      render:()=>rendered.push(context.section),loadSharedDates:async()=>{}
    };
    context.address=()=>context.year+'/'+context.section+'/'+context.term;
    vm.runInNewContext(helper+loader,context);
    await context.load();
    assert.deepEqual(navigationBusy,[true,false],mode+' restores navigation after loading, including errors');
    if(mode==='failure'){
      assert.equal(context.openingTermPending,true);
      assert.equal(context.retry.hidden,false);
      assert.equal(requested.length,0);
    }else if(mode==='legacy-attendance'){
      assert.equal(context.section,'setup');
      assert.equal(context.setupTab,6);
      assert.equal(requested[0],'2026/setup/1');
    }else if(mode==='direct' || mode==='term-explicit'){
      assert.equal(years.length,0);
      assert.equal(requested[0],mode==='direct'?'2026/goals/1':'2026/term/1');
    }else if(mode==='unavailable'){
      assert.equal(rendered[0],'cover');
      assert.equal(requested.length,0);
    }else{
      assert.equal(context.section,'term');
      assert.equal(context.term,mode==='holiday'?'3':'4');
      assert.equal(context.year,mode==='january'?2025:2026);
      assert.equal(requested[0],`${context.year}/term/${context.term}`);
      assert.equal(context.openingTermPending,false);
    }
  }
});

test('term date fill uses WHS boundaries first and preserves saved or newly edited inputs', async () => {
  const source=await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helpers=source.slice(source.indexOf('  function termRanges('),source.indexOf('  function render(data)'));
  const el=(tag,text='',attrs={})=>({tag,text,attrs,children:[],isConnected:true,append(...nodes){this.children.push(...nodes);},addEventListener(){}});
  for(const mode of ['empty','saved','manual','failure']){
    const start={value:mode==='saved'?'2026-10-14':'',dataset:{autoTermDate:mode==='saved'?'false':'true'}};
    const end={value:'',dataset:{autoTermDate:'true'}};
    const boxes=[];
    const context={
      el,year:2026,term:'4',section:'term',week:'2026-10-19',api:'/api/planner/',setupDates:[],
      date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10),
      content:{prepend(node){boxes.push(node);},querySelector:selector=>selector.includes('startDate')?start:end,querySelectorAll:()=>[]},
      console:{error(){}},
      request:async url=>{
        if(url.includes('school-settings'))return {content:{term4Start:'2026-10-13'},revision:1};
        if(mode==='failure')throw new Error('Term source unavailable');
        if(mode==='manual'){end.dataset.autoTermDate='false';end.value='2026-12-17';}
        return {available:true,terms:[{term:4,startDate:'2026-10-12',endDate:'2026-12-18'}]};
      }
    };
    await vm.runInNewContext(helpers+'\nloadSharedDates();',context);
    assert.equal(start.value,mode==='saved'?'2026-10-14':mode==='failure'?'':'2026-10-13');
    assert.equal(end.value,mode==='manual'?'2026-12-17':mode==='failure'?'':'2026-12-18');
    assert.equal(Boolean(boxes[0].open),mode==='failure');
    if(mode==='failure')assert.ok(boxes[0].children.some(node=>node.attrs.role==='alert'));
  }
});

test('teacher timetable has its own private save, collapsed instructions and independent calendar', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helper = source.slice(source.indexOf('  function renderTeacherTimetable('),source.indexOf('  function setupFolder('));
  const el = (tag,text='',attrs={})=>({
    tag,text,attrs,children:[],dataset:{},isConnected:true,
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=nodes;},
    setAttribute(key,value){this.attrs[key]=value;},
    addEventListener(event,handler){this[event]=handler;}
  });
  const host=el('section'),calls=[],calendars=[];
  const fixtureUrl='https://westlandhigh.school.kiwi/ics/TEST-FIXTURE.ics';
  const context={
    el,host,api:'/api/planner/',csrf:'fixture-csrf',refreshSession:async()=>{},console:{error(){}},
    renderKamarCalendar:(node,options)=>calendars.push(options),
    request:async(url,options)=>{
      calls.push({url,options});
      return options ? {revision:1} : {subscription_url:'',revision:0};
    }
  };
  vm.runInNewContext(helper+'\nrenderTeacherTimetable(host);',context);
  await new Promise(resolve=>setImmediate(resolve));
  const hint=host.children.find(node=>node.tag==='details');
  assert.equal(hint.attrs.open,undefined);
  assert.equal(hint.children[1].children.length,7);
  const settings=host.children.find(node=>node.attrs.class==='teacher-timetable-settings');
  const input=settings.children[1],saveButton=settings.children[2];
  assert.equal(input.attrs.name,undefined);
  assert.equal(input.attrs.type,'text');
  assert.equal(input.disabled,false);
  assert.equal(calendars.length,0);
  input.value=fixtureUrl;input.input();
  assert.equal(host.dataset.timetableDirty,'true');
  await saveButton.click();
  assert.equal(host.dataset.timetableDirty,'false');
  assert.equal(calls[1].url,'/api/planner/kamar-timetable');
  assert.equal(calls[1].options.headers['x-planner-csrf'],'fixture-csrf');
  assert.deepEqual(JSON.parse(calls[1].options.body),{subscription_url:fixtureUrl,revision:0});
  assert.equal(calendars[0].personal,true);
  assert.equal(calendars[0].feed,fixtureUrl);
  input.value='';input.input();
  await saveButton.click();
  assert.equal(calendars.length,1);
  assert.equal(JSON.parse(calls[2].options.body).subscription_url,'');
  assert.ok(settings.children[3].textContent.includes('disconnected'));
});

test('setup folder switches accessible right-side sheets without recreating unsaved settings', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helper = source.slice(source.indexOf('  function setupFolder('),source.indexOf('  function renderSetup('));
  const el = (tag,text='',attrs={})=>({
    tag,text,attrs,children:[],hidden:false,dataset:{},
    append(...nodes){this.children.push(...nodes);},
    setAttribute(key,value){this.attrs[key]=value;},
    addEventListener(event,handler){this[event]=handler;},
    focus(){this.focused=true;},querySelector(){return null;}
  });
  const saveRow = {hidden:false};
  const page = el('section');
  page.append({value:'Unsaved school date'});
  let calendarLoads=0;
  let teacherLoads=0;
  let tasksLoads=0;
  const context = {el,year:2026,setupTab:0,attendanceSyncRunning:false,history:{replaceState(){}},viewFragment:()=>'',document:{querySelector:()=>saveRow},page,renderKamarCalendar(){calendarLoads++;},renderTeacherTimetable(){teacherLoads++;},
    mountGoogleTasks(host,setup){assert.equal(setup,true);tasksLoads++;}};
  const folder = vm.runInNewContext(helper+'\nsetupFolder(page);',context);
  const [tabs, planner, kamar] = folder.children;
  assert.equal(tabs.attrs['aria-orientation'],'vertical');
  assert.equal(planner,page);
  assert.equal(planner.hidden,false);
  assert.equal(kamar.hidden,true);
  tabs.children[1].click();
  assert.equal(planner.hidden,true);
  assert.equal(kamar.hidden,false);
  assert.equal(saveRow.hidden,true);
  assert.equal(tabs.children[1].attrs['aria-selected'],'true');
  assert.equal(calendarLoads,1);
  assert.equal(teacherLoads,1);
  assert.ok(kamar.children.some(node=>node.text.includes('School Events')));
  let prevented=false;
  tabs.children[1].keydown({key:'Home',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(tabs.children[0].focused,true);
  assert.equal(planner.hidden,false);
  assert.equal(saveRow.hidden,false);
  assert.equal(planner.children[0].value,'Unsaved school date');
  tabs.children[1].click();
  assert.equal(calendarLoads,1);
  assert.equal(tabs.children.length,7);
  assert.equal(tasksLoads,0);
  tabs.children[1].keydown({key:'ArrowDown',preventDefault(){}});
  assert.equal(tasksLoads,1);
  assert.equal(tabs.children[2].attrs['aria-selected'],'true');
  assert.equal(saveRow.hidden,true);
  tabs.children[2].keydown({key:'ArrowUp',preventDefault(){}});
  assert.equal(tabs.children[1].attrs['aria-selected'],'true');
  tabs.children[2].click();
  assert.equal(tasksLoads,1);
});

test('term circles display numbers and weekly timetable notes stay readable without changing print size', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const selector = source.slice(source.indexOf('  function renderSelectors()'),source.indexOf("    if (section === 'week') {",source.indexOf('  function renderSelectors()'))) + '\n  }';
  const el = (tag,text='',attrs={}) => ({ tag,text,attrs,children:[],dataset:{},
    append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},
    addEventListener(event,handler){this[event]=handler;} });
  for (const allowed of [true,false]) {
    const selectors=el('div');
    let loads=0;
    const context={el,selectors,section:'term',term:'4',termSelectionPending:true,canLeave:()=>allowed,load(){loads++;}};
    const nodes=[];
    context.el=(...args)=>{const node=el(...args);nodes.push(node);return node;};
    vm.runInNewContext(selector,context);
    context.renderSelectors();
    const select=nodes.find(node=>node.tag==='select');
    assert.equal(nodes.find(node=>node.attrs.class==='planner-term-caption').text,'Term');
    assert.deepEqual(select.children.map(node=>node.text),['1','2','3','4']);
    assert.deepEqual(select.children.map(node=>node.attrs['aria-label']),['Term 1','Term 2','Term 3','Term 4']);
    select.value='2';select.change();
    assert.equal(context.term,allowed?'2':'4');
    assert.equal(loads,allowed?1:0);
    assert.equal(select.value,allowed?'2':'4');
  }
  const css=await fs.readFile(path.join(__dirname,'public','planner.css'),'utf8');
  assert.match(css,/\.planner-term-badge \{[^}]*font-size: 42px/);
  assert.match(css,/\.planner-term-caption \{[^}]*pointer-events: none/);
  assert.match(css,/\.planner-week textarea \{[^}]*font-size: 16px/);
  assert.doesNotMatch(css,/\.planner-week textarea \{[^}]*font-size: 11px/);
  assert.match(css,/@media print \{[\s\S]*?\.planner-week textarea \{[^}]*font-size: 9px/);
});

test('weekly term follows teaching weekdays, WHS overrides and term/holiday boundaries', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helper = source.slice(source.indexOf('  function termRanges('),source.indexOf('  async function loadSharedDates('));
  const context = {date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10)};
  vm.runInNewContext(helper,context);
  const terms = [
    {term:1,startDate:'2026-01-26',endDate:'2026-04-02'},
    {term:2,startDate:'2026-04-20',endDate:'2026-07-03'},
    {term:3,startDate:'2026-07-20',endDate:'2026-09-25'},
    {term:4,startDate:'2026-10-12',endDate:'2026-12-18'}
  ];
  for (const [week,expected] of [
    ['2026-01-19',''],['2026-01-26','1'],['2026-03-30','1'],
    ['2026-04-06',''],['2026-04-20','2'],['2026-07-20','3'],
    ['2026-09-28',''],['2026-10-19','4'],['2026-12-21','']
  ]) assert.equal(context.weeklyTerm({},terms,week),expected,week);
  assert.equal(context.weeklyTerm({term1Start:'2026-02-02'},terms,'2026-01-26'),'');
  assert.equal(context.weeklyTerm({term1Start:'2026-01-28',term1End:'2026-04-02'},[],'2026-01-26'),'1');
  assert.equal(context.weeklyTerm({},[],'2028-01-24'),'');
});

test('weekly auto-term loads Ministry dates but preserves saved and manually changed choices', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const renderer = source.slice(source.indexOf('  function termRanges('),source.indexOf('  function render(data)'));
  const el = (tag,text='',attrs={})=>({
    tag,text,attrs,children:[],isConnected:true,append(...nodes){this.children.push(...nodes);},addEventListener(){}
  });

  await test('teaching week numbers match term starts 1,11,22,32 and exclude holidays and pre-student weeks', async () => {
    const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
    const helper = source.slice(source.indexOf('  function termRanges('),source.indexOf('  async function loadSharedDates('));
    const context = {date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10)};
    vm.runInNewContext(helper,context);
    const terms = [
      {term:1,startDate:'2026-01-26',endDate:'2026-04-02'},
      {term:2,startDate:'2026-04-20',endDate:'2026-07-03'},
      {term:3,startDate:'2026-07-20',endDate:'2026-09-25'},
      {term:4,startDate:'2026-10-12',endDate:'2026-12-18'}
    ];
    const settings = { studentFirstDay:'2026-01-29' };
    for (const [week,termWeek,schoolYearWeek] of [
      ['2026-01-19','',''],['2026-01-26','1','1'],['2026-03-30','10','10'],
      ['2026-04-06','',''],['2026-04-13','',''],['2026-04-20','1','11'],
      ['2026-06-29','11','21'],['2026-07-06','',''],['2026-07-20','1','22'],
      ['2026-09-21','10','31'],['2026-09-28','',''],['2026-10-12','1','32'],
      ['2026-10-19','2','33'],['2026-12-14','10','41'],['2026-12-21','','']
    ]) {
      const actual = context.weeklyNumbers(settings,terms,week);
      assert.equal(actual.termWeek,termWeek,week);
      assert.equal(actual.schoolYearWeek,schoolYearWeek,week);
    }
    assert.equal(context.weeklyNumbers({studentFirstDay:'2026-02-03'},terms,'2026-01-26').termWeek,'');
    assert.equal(context.weeklyNumbers({studentFirstDay:'2026-02-03'},terms,'2026-02-02').schoolYearWeek,'1');
    assert.equal(context.weeklyNumbers({term2Start:'2026-04-22'},terms,'2026-04-20').termWeek,'1');
    assert.equal(context.weeklyNumbers({},terms.slice(3),'2026-10-19').termWeek,'2');
    assert.equal(context.weeklyNumbers({},terms.slice(3),'2026-10-19').schoolYearWeek,'');
    assert.equal(context.weeklyNumbers({term1Start:'2026-02-30'},terms,'2026-10-19').schoolYearWeek,'');
    assert.equal(context.weeklyNumbers({term2Start:'2026-04-01'},terms,'2026-03-30').termWeek,'');
    const yearBoundary = [{term:1,startDate:'2027-01-01',endDate:'2027-01-08'}];
    assert.equal(context.weeklyNumbers({},yearBoundary,'2026-12-28').termWeek,'1');
    assert.equal(context.weeklyNumbers({},yearBoundary,'2027-01-04').schoolYearWeek,'2');
  });

  await test('weekly number boxes load even with a saved term and are calculated independently of manual term choice', async () => {
    const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
    const renderer = source.slice(source.indexOf('  function termRanges('),source.indexOf('  function render(data)'));
    const el = (tag,text='',attrs={})=>({
      tag,text,attrs,children:[],isConnected:true,append(...nodes){this.children.push(...nodes);},addEventListener(){}
    });
    const select = {dataset:{autoTerm:'false'},value:'2'};
    const termNumber = {value:''}, yearNumber = {value:''}, help = {}, badge = {value:'1',dataset:{}};
    const nodes = {'#week-term':select,'#term-week-number':termNumber,'#school-year-week-number':yearNumber,'#week-number-help':help};
    const context = {
      year:2026,section:'week',week:'2026-10-19',el,api:'/api/planner/',setupDates:[],
      selectors:{querySelector:()=>badge},
      content:{prepend(){},querySelector:selector=>nodes[selector],querySelectorAll:()=>[]},
      date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10),console:{error(){}},
      request:async url=>url.includes('school-settings') ? {revision:1,content:{
        studentFirstDay:'2026-01-29',term1Start:'2026-01-26',term1End:'2026-04-02',
        term2Start:'2026-04-20',term2End:'2026-07-03',term3Start:'2026-07-20',term3End:'2026-09-25',
        term4Start:'2026-10-12',term4End:'2026-12-18'
      }} : assert.fail('Complete WHS dates must not need Ministry fallback')
    };
    await vm.runInNewContext(renderer+'\nloadSharedDates();',context);
    assert.equal(select.value,'2');
    assert.equal(badge.value,'4', 'navigation badge follows actual week dates, not the saved editable term field');
    assert.equal(termNumber.value,'2');
    assert.equal(yearNumber.value,'33');
    assert.ok(help.textContent.includes('Teaching weeks only'));
    const render = source.slice(source.indexOf('  function renderWeek(data)'),source.indexOf('  function bilingualRow('));
    assert.match(render, /'term-week-number', 'Term Week'/);
    assert.match(render, /'school-year-week-number', 'School Year Week'/);
    assert.match(render, /readonly: ''/);
    assert.match(render, /type: 'hidden', name: 'weekNumber', value: data.weekNumber/);
  });
  for (const mode of ['auto','saved','manual','failure']) {
    const select = {dataset:{autoTerm:mode==='saved'?'false':'true'},value:mode==='saved'?'2':''};
    let calendarRequests=0;
    const context = {
      year:2026,section:'week',week:'2026-10-19',el,api:'/api/planner/',
      selectors:{querySelector:()=>null},
      setupDates:[],content:{prepend(){},querySelector:selector=>selector==='#week-term'?select:null,querySelectorAll:()=>[]},
      date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10),
      console:{error(){}},
      request:async url=>{
        if(url.includes('school-settings')) return {revision:1,content:{}};
        calendarRequests++;
        if(mode==='failure') throw new Error('Calendar unavailable');
        if(mode==='manual'){select.dataset.autoTerm='false';select.value='3';}
        return {available:true,terms:[{term:4,startDate:'2026-10-12',endDate:'2026-12-18'}]};
      }
    };
    await vm.runInNewContext(renderer+'\nloadSharedDates();',context);
    assert.equal(select.value,{auto:'4',saved:'2',manual:'3',failure:''}[mode]);
    assert.equal(calendarRequests,mode==='saved'?0:1);
  }
});

test('calendar boxes summarise two events and side panel retains the full day without duplicate refreshes', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helpers = source.slice(source.indexOf('  function setCalendarEvents('),source.indexOf('  function renderCalendar()'));
  const el = (tag,text = '',attrs = {}) => ({
    tag,text,attrs,children:[],
    append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} },
    replaceChildren() { this.children=[]; },
    setAttribute(key,value) { this.attrs[key]=value; },
    addEventListener(event,handler) { this[event]=handler; },
    remove() { this.parent.children=this.parent.children.filter(node=>node!==this); }
  });
  const button = el('button','28');
  button.dataset={date:'2026-01-28'};
  button.querySelector=()=>button.children.find(node=>node.attrs.class==='calendar-event-names');
  const panel = el('aside');
  const events = Array.from({length:3},(_,i)=>({date:'2026-01-28',name:'Event '+i,details:'Full details '+i,source:'WHS'}));
  let loads=0;
  const context = {
    el,calendarEventSources:{},selectedCalendarDate:'',section:'year',week:'',
    content:{querySelectorAll:()=>[button],querySelector:()=>panel},
    date:value=>new Date(value+'T00:00:00Z'),canLeave:()=>true,monday:()=>'2026-01-26',load:()=>loads++
  };
  vm.runInNewContext(helpers,context);
  context.events=events;
  vm.runInNewContext("setCalendarEvents('school',events);showCalendarDay('2026-01-28');",context);
  assert.deepEqual(button.children[0].children.map(node=>node.text),['Event 0','Event 1','+1 more']);
  assert.equal(panel.children.filter(node=>node.attrs.class==='calendar-day-event').length,3);
  assert.equal(panel.children[3].children[2].text,'Full details 2');
  assert.equal(button.attrs['aria-pressed'],'true');
  vm.runInNewContext("setCalendarEvents('school',events);",context);
  assert.equal(button.children.length,1);
  assert.equal(panel.children.filter(node=>node.attrs.class==='calendar-day-event').length,3);
  panel.children.at(-1).click();
  assert.equal(context.section,'week');
  assert.equal(context.week,'2026-01-26');
  assert.equal(loads,1);
});

test('school-wide date hint starts collapsed and opens to expose request failures', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const renderer = source.slice(source.indexOf('  async function loadSharedDates('),source.indexOf('  function render(data)'));
  const el = (tag,text = '',attrs = {}) => ({
    tag,text,attrs,children:[],isConnected:true,
    append(...nodes) { this.children.push(...nodes); },addEventListener() {}
  });
  for (const fails of [false,true]) {
    const content = {children:[],prepend(node){this.children.push(node);},querySelectorAll(){return [];}};
    await vm.runInNewContext(renderer + '\nloadSharedDates();', {
      year:2026,section:'year',week:'2026-01-05',el,content,api:'/api/planner/',
      setupDates:[],date:value=>new Date(value+'T00:00:00Z'),setCalendarEvents(){},
      request:async()=>{if(fails) throw new Error('Fixture unavailable');return {revision:1,content:{}};},
      console:{error(){}}
    });
    const box = content.children[0];
    assert.equal(box.tag,'details');
    assert.equal(box.children[0].tag,'summary');
    assert.equal(box.children[0].text,'Hint: WHS school-wide dates');
    assert.equal(Boolean(box.open),fails);
    if(fails) assert.ok(box.children.some(node=>node.tag==='button' && node.text==='Retry school-wide dates'));
  }
});

test('year overview keeps school-break and named public-holiday markers together', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const renderer = source.slice(source.indexOf('  async function loadSchoolCalendar()'),source.indexOf('  function artwork('));
  const el = (tag,text = '',attrs = {}) => ({
    tag,text,attrs,children:[],isConnected:true,
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(key,value) { this.attrs[key] = value; },
    addEventListener() {}
  });
  const buttons = ['2026-04-03','2026-04-04','2026-04-27','2026-11-30'].map(date => ({
    attrs:{'aria-label':'Open week containing '+date},title:'',
    parentElement:{classes:[],classList:{add(value){this.owner.classes.push(value);}}},
    getAttribute(key) { return this.attrs[key]; },
    setAttribute(key,value) { this.attrs[key] = value; }
  }));
  for (const button of buttons) button.parentElement.classList.owner = button.parentElement;
  const content = {children:[],prepend(node){this.children.unshift(node);},querySelectorAll(){return buttons;}};
  const calendar = {year:2026,available:true,terms:[],notes:[],holidays:[{startDate:'2026-04-03',endDate:'2026-04-19',term:1,description:'School break'}],
    publicHolidaysAvailable:true,publicHolidaysSourceUrl:'https://www.govt.nz/',fetchedAt:'2026-10-18T00:00:00Z',
    publicHolidays:[{date:'2026-04-03',name:'Good Friday'},{date:'2026-04-27',name:'Anzac Day (observed)'},{date:'2026-11-30',name:'Westland Anniversary Day (observed)'}]};
  await vm.runInNewContext(renderer + '\nloadSchoolCalendar();', {
    year:2026,el,content,api:'/api/planner/',document:{body:{dataset:{coreUrl:'https://core.example.test'}}},
    request:async()=>calendar,console,setCalendarEvents(){},
    date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10)
  });
  assert.deepEqual(buttons[0].parentElement.classes,['school-holiday','public-holiday']);
  assert.deepEqual(buttons[1].parentElement.classes,['school-holiday']);
  assert.match(buttons[2].attrs['aria-label'],/Anzac Day \(observed\)/);
  assert.match(buttons[3].title,/Westland/);
  assert.equal(content.children[0].children.find(node=>node.attrs.class==='public-holiday-list').children.length,3);
  assert.equal(content.children[0].tag,'details');
  assert.equal(content.children[0].attrs.open,undefined);
  assert.equal(content.children[0].children[0].tag,'summary');
  assert.equal(content.children[0].children[0].text,'Hint: School terms & public holidays');
});

test('attendance setup tab mounts once, preserves drafts and blocks leaving during sync or attendance edits', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const helper = source.slice(source.indexOf('  function setupFolder('),source.indexOf('  function renderSetup('));
  const el = (tag,text='',attrs={}) => ({
    tag,text,attrs,children:[],dataset:{},isConnected:true,hidden:false,
    append(...nodes){this.children.push(...nodes);}, replaceChildren(...nodes){this.children=nodes;},
    setAttribute(key,value){this.attrs[key]=value;}, addEventListener(event,handler){this[event]=handler;},
    querySelector(){return this.pending?{}:null;}, focus(){this.focused=true;}
  });
  const page = el('section'), saveRow={}, messages=[], mounts=[];
  page.append({value:'Unsaved school date'});
  let finish;
  const context = {el,page,year:2026,setupTab:0,attendanceSyncRunning:false,
    document:{querySelector:()=>saveRow},history:{replaceState(){}},viewFragment:()=>'',notice:message=>messages.push(message),
    mountAttendancePage:(host,overview)=>{mounts.push({host,overview});return new Promise(resolve=>{finish=resolve;});}};
  const folder = vm.runInNewContext(helper+'\nsetupFolder(page);',context);
  const tabs=folder.children[0], attendance=folder.children[7];
  assert.equal(tabs.children[6].text,'Two-Week Attendance');
  tabs.children[6].click();
  assert.equal(mounts.length,1);assert.equal(mounts[0].overview,true);
  assert.equal(mounts[0].host,attendance);assert.equal(saveRow.hidden,true);
  tabs.children[0].click();assert.equal(context.setupTab,6,'loading cannot be interrupted');
  finish();await context.setupAttendanceReady;
  attendance.pending=true;tabs.children[0].click();assert.equal(context.setupTab,6);
  attendance.pending=false;context.attendanceSyncRunning=true;
  let prevented=false;
  tabs.children[6].keydown({key:'Home',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(context.setupTab,6);assert.equal(tabs.children[0].focused,undefined);
  context.attendanceSyncRunning=false;tabs.children[0].click();
  assert.equal(saveRow.hidden,false);assert.equal(page.children[0].value,'Unsaved school date');
  tabs.children[6].click();assert.equal(mounts.length,1,'tab state is retained without remount');
  assert.equal(messages.length,3);
});

test('cover no longer duplicates Setup My Planner, which is first in shared Setup navigation', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const renderer = source.slice(source.indexOf('  function render(data)'), source.indexOf('  async function load()'));
  const el = (tag,text = '',attrs = {}) => ({
    tag,text,attrs,children:[],dataset:{},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren() { this.children = []; },
    addEventListener(event,handler) { this[event] = handler; }
  });
  const content = el('div');
  let loads = 0;
  const context = {content,section:'cover',el,coverPage:()=>el('section'),canLeave:()=>true,load:()=>loads++};
  vm.runInNewContext(renderer + '\nrender({});', context);
  assert.equal(content.children[0].children.length,0);
  assert.equal(loads,0);
  const shell = renderShell({baseUrl:'/planner/',coreUrl:'',standalone:false});
  const setup = shell.match(/aria-labelledby="planner-nav-setup"[\s\S]*?<\/section>/)[0];
  assert.ok(setup.indexOf('data-section="setup"') < setup.indexOf('data-section="assessmentSetup"'));
  assert.doesNotMatch(setup, /attendanceImport/);
});

test('integration tab form submissions never save shared school settings', async () => {
  const source = await fs.readFile(path.join(__dirname,'public','planner.js'),'utf8');
  const listener = source.slice(source.indexOf("  form.addEventListener('submit'"), source.indexOf("  document.querySelectorAll('[data-section]')"));
  for (const section of ['setup','attendance','attendanceImport','week']) {
    for (let setupTab = 0; setupTab <= 6; setupTab++) {
      let handler, saves = 0, prevented = false;
      vm.runInNewContext(listener, { section, setupTab, form:{addEventListener(event, fn){handler=fn;}},saveEntry(){saves++;} });
      handler({preventDefault(){prevented=true;}});
      assert.equal(prevented,true);
      assert.equal(saves,section==='week' || section==='setup' && setupTab===0 ? 1 : 0);
    }
  }
});

test('goals annual plan retains saved goals and renders independent date and priority fields', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const renderer = source.slice(source.indexOf('  function renderGoals('), source.indexOf('  function render(data)'));
  const el = (tag, text = '', attrs = {}) => ({
    tag, text, attrs, children: [], append(...nodes) { this.children.push(...nodes); }
  });
  const fields = [];
  const data = {professional:'Existing professional goal',wellbeing:'Existing wellbeing goal',
    standards:'Existing evidence',reflection:'Existing reflection',annualDate8:'18 Oct',annualEvent8:'Event',priority3:'Third priority'};
  const content = el('div');
  vm.runInNewContext(renderer + '\nrenderGoals(data);', {
    el, content, data, fields:{goals:[['standards','Evidence'],['reflection','Reflection']]},
    inputField(name, label, value, type) { fields.push({name,value,type}); return el('field',label); }
  });
  assert.equal(content.children.length, 2);
  assert.equal(content.children[1].attrs.class, 'paper-page annual-goals');
  assert.equal(fields.length, 23);
  assert.equal(new Set(fields.map(field => field.name)).size, 23);
  for (const [name,value] of Object.entries(data)) assert.equal(fields.find(field => field.name === name).value,value);
  assert.equal(fields.filter(field => field.name.startsWith('annualDate')).length,8);
  assert.equal(fields.filter(field => field.name.startsWith('annualEvent')).length,8);
  assert.equal(fields.filter(field => field.name.startsWith('priority')).length,3);
  assert.ok(fields.every(field => !['importantDates','priorities','startOfYear','pepeha'].includes(field.name)));
});

test('standards and learning render editable saved values for every prototype component', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const renderers = source.slice(source.indexOf('  function bilingualRow('), source.indexOf('  function render(data)'));
  const el = (tag, text = '', attrs = {}) => ({
    tag, text, attrs, children: [], classList: { add() {} },
    append(...nodes) { this.children.push(...nodes); }
  });
  const fields = [];
  const content = el('div');
  const inputField = (name, label, value) => {
    const field = el('div');
    const area = el('textarea', value);
    area.setAttribute = (key, item) => { area.attrs[key] = item; };
    field.querySelector = () => area;
    field.append(area);
    fields.push({name, label, value, area});
    return field;
  };
  const answers = Object.fromEntries([
    ...reference.standards.map((_, i) => ['focus' + (i + 1), 'Saved focus ' + i]),
    ...reference.reflectionGroups.flatMap(group => group.questions.map(([id]) => [id, 'Saved ' + id]))
  ]);
  const context = { ...reference, el, content, inputField, artwork: () => el('img'), data: answers };
  vm.runInNewContext(renderers + '\nrenderStandards(data);', context);
  assert.equal(content.children[0].children.length, 3);
  assert.equal(fields.length, 23);
  assert.equal(new Set(fields.map(field => field.name)).size, 23);
  for (const field of fields) assert.equal(field.value, answers[field.name]);
  assert.equal(fields.find(field => field.name === 'reflection15').area.attrs['aria-describedby'], 'prompt-reflection15');
  fields.length = 0;
  context.data = {entries:'Existing log', applications:'Apply learning', other:'Other details', types:['reading', 'other']};
  context.fields = {learning:[['entries', 'Professional learning log', '', 'Log hint']]};
  vm.runInNewContext('renderLearning(data);', context);
  const page = content.children[1];
  const choices = page.children[1].children.slice(2);
  assert.equal(choices.length, 15);
  assert.deepEqual(choices.filter(choice => choice.children[0].checked).map(choice => choice.children[0].attrs.value), ['reading', 'other']);
  assert.deepEqual(fields.map(field => [field.name, field.value]), [
    ['other','Other details'], ['applications','Apply learning'], ['entries','Existing log']
  ]);
});

test('year calendar places Māori months below English months and retains every date', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const calendar = source.slice(source.indexOf('  function renderCalendar()'), source.indexOf('  function artwork('));
  const el = (tag, text = '', attrs = {}) => ({
    tag, text, attrs, children: [],
    append(...nodes) { this.children.push(...nodes); },
    addEventListener() {}
  });
  for (const [year, dates] of [[2026, 365], [2028, 366]]) {
    const content = el('div');
    vm.runInNewContext(calendar + '\nrenderCalendar();', {
      el, content, year, iso: value => value.toISOString().slice(0, 10)
    });
    assert.equal(content.children[0].attrs.class,'year-calendar-layout');
    assert.equal(content.children[0].children[1].tag,'aside');
    const pages = content.children[0].children[0].children;
    assert.equal(pages.length, 2);
    const months = [
      ['Hānuere', 'Pēpuere', 'Māehe', 'Āperira', 'Mei', 'Hune'],
      ['Hūrae', 'Ākuhata', 'Hepetema', 'Oketopa', 'Nōema', 'Tīhema']
    ];
    let count = 0;
    pages.forEach((page, index) => {
      const [head, body] = page.children[1].children;
      assert.equal(head.children.length, 2);
      assert.equal(head.children[0].children[1].text, index ? 'Jul' : 'Jan');
      assert.deepEqual(head.children[1].children.map(cell => cell.text), ['', ...months[index]]);
      assert.equal(head.children[1].attrs.lang, 'mi');
      assert.equal(head.children[1].children.length, 7);
      for (const row of body.children) {
        for (const cell of row.children) count += cell.children.filter(node => node.tag === 'button').length;
      }
    });
    assert.equal(count, dates);
  }
});

test('paper planner shell retains nested assets, private identity escaping and approved artwork', async () => {
  const html = renderShell({baseUrl:'/planner/',coreUrl:'https://core.example.test',standalone:true,
    displayName:'Teacher <script>alert(1)</script>', userEmail:'teacher"@example.test'});
  assert.match(html, /data-assets="\/planner\/framework\/"/);
  assert.match(html, /moderation-schema\.js\?v=requirement-cleanup-2/);
  assert.match(html, /moderation\.js\?v=nzqa-version-8/);
  assert.match(html, /data-planner-name="Teacher &lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(html, /data-user-email="teacher&quot;@example.test"/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /data-section="cover" aria-current="page"/);
  assert.deepEqual([...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]),
    ['cover', 'year', 'term', 'week', 'setup', 'assessmentSetup', 'attendance', 'moderation', 'standards', 'learning']);
  const groups = [...html.matchAll(/<section class="planner-nav-group [^"]+" aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)];
  assert.equal(groups.length, 3);
  for (const [index, expected] of [
    ['cover', 'year', 'term', 'week'],
    ['setup', 'assessmentSetup'], ['attendance', 'moderation', 'standards', 'learning']
  ].entries()) {
    assert.match(groups[index][2], new RegExp('<h2 id="' + groups[index][1] + '">'));
    assert.deepEqual([...groups[index][2].matchAll(/data-section="([^"]+)"/g)].map(match => match[1]), expected);
  }
  assert.match(groups[0][2], />Planning<\/h2>/);
  assert.match(groups[1][2], />Setup<\/h2>/);
  assert.match(groups[2][2], />Section Modules<\/h2>/);
  assert.equal([...groups[2][2].matchAll(/disabled title="Page coming soon"/g)].length, 5);
  assert.match(html, /planner\.css\?v=term-circle-31/);
  assert.ok(html.indexOf('src="/planner/framework/planner-reference.js"') < html.indexOf('src="/planner/framework/planner.js?v=term-circle-29"'));
  assert.ok(html.indexOf('src="/planner/framework/opening-dates-2026.js"') < html.indexOf('src="/planner/framework/planner.js?v=term-circle-29"'));
  const heading = html.match(/<header class="planner-heading">([\s\S]*?)<\/header>/)[1];
  for (const id of ['planner-year', 'open-year', 'print-planner']) {
    assert.match(heading, new RegExp('id="' + id + '"'));
    assert.equal([...html.matchAll(new RegExp('id="' + id + '"', 'g'))].length, 1);
  }
  assert.match(heading, /class="planner-year-badge" aria-label="Open planner year 2026"/);
  assert.match(heading, /id="planner-year-badge-value">2026<\/span>/);
  assert.match(html, /src="\/planner\/framework\/attendance\.js\?v=timetable-tabs-9"/);
  assert.match(groups[1][2], /id="refresh-weekly-duties" hidden>Refresh duties<\/button>/);
  assert.match(html, /id="planner-signin-link"/);
  assert.match(html, /href="https:\/\/core.example.test\/contact"/);
  for (const name of ['cover-kokako','term-1-takahe','term-2-bird','term-3-kakapo','term-4-kiwi','teaching-standards']) {
    const image = await fs.readFile(path.join(__dirname,'public','artwork',name+'.webp'));
    assert.equal(image.toString('ascii',0,4),'RIFF');
    assert.equal(image.toString('ascii',8,12),'WEBP');
    assert.ok(image.length < 750000,'artwork is optimized for web delivery');
  }
});

test('secondary navigation rows use distinct accessible enabled colours and a separate selected state', async () => {
  const css = await fs.readFile(path.join(__dirname, 'public', 'planner.css'), 'utf8');
  const colours = [...css.matchAll(/--row-(?:colour|selected): (#[0-9a-f]{6})/g)].map(match => match[1]);
  assert.equal(colours.length, 6);
  assert.equal(new Set(colours).size, 6);
  for (const colour of colours) {
    const channels = colour.slice(1).match(/../g).map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    assert.ok(1.05 / (luminance + .05) >= 4.5, colour + ' meets normal-text contrast with white');
  }
  assert.match(css, /button:not\(:disabled\) \{[^}]*background: var\(--row-colour\)[^}]*color: #fff/);
  assert.match(css, /button\[aria-current="page"\] \{[^}]*box-shadow: inset 0 0 0 2px #fff/);
  assert.match(css, /secondary-row button:disabled \{[^}]*cursor: not-allowed/);
});

test('module denies anonymous/student access and accepts a supplied teacher identity', async () => {
  let user;
  const app = express();
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/module/', createModuleRouter());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/module/`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url + 'api/kamar-calendar/2026/10')).status,401);
    user = { roles: ['Student'] };
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url + 'api/kamar-calendar/2026/10')).status,403);
    user = { roles: ['Teacher'] };
    assert.equal((await fetch(url + 'api/kamar-calendar/2026/13')).status,400);
    assert.equal((await fetch(url + 'api/kamar-calendar/1999/10')).status,400);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /framework\/whs-logo.png/);
    assert.match(html, /Last Updated:/);
    assert.match(html, /id="planner-year"[^>]*value="2026"/);
    assert.match(html, /data-api="\/module\/api\/planner\/"/);
    assert.match(html, /src="\/module\/framework\/planner\.js\?v=term-circle-29"/);
    assert.match(html, /Weekly planner/);
    assert.match(html, /Professional learning/);
    assert.ok(!html.includes('name="whs-global-control"'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
