const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCalendar, loadCalendar, SOURCE_URL, GOOGLE_URL, validTimetableUrl, loadTimetable } = require('./kamarCalendar');
const wrap = events => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + events + '\r\nEND:VCALENDAR';

test('private subscription validation only permits personal KAMAR HTTPS feeds', async t => {
  assert.equal(validTimetableUrl(''),true);
  assert.equal(validTimetableUrl('https://westlandhigh.school.kiwi/ics/TEST-FIXTURE.ics'),true);
  for(const value of [null,42,'https://localhost/ics/TEST-FIXTURE.ics',
    'https://westlandhigh.school.kiwi.evil.test/ics/TEST-FIXTURE.ics',
    'https://user:password@westlandhigh.school.kiwi/ics/TEST-FIXTURE.ics',
    'https://westlandhigh.school.kiwi/ics/../private.ics',
    'https://westlandhigh.school.kiwi/ics/school.ics']) assert.equal(validTimetableUrl(value),false);
  const mock=t.mock.method(globalThis,'fetch',async()=>{throw new Error('Must not fetch invalid destinations');});
  await assert.rejects(loadTimetable('https://localhost/private',2026,10),/Invalid/);
  assert.equal(mock.mock.callCount(),0);
});

test('KAMAR parsing handles folded/escaped text, exclusive all-day ends and UTC dates', () => {
  const events = parseCalendar(wrap(`BEGIN:VEVENT
UID:school-day
DTSTART;VALUE=DATE:20261019
DTEND;VALUE=DATE:20261021
SUMMARY:School\\, Events
DESCRIPTION:First line\\nSecond line with
  folded text
LOCATION:Hall
END:VEVENT
BEGIN:VEVENT
UID:timed
DTSTART:20261018T230000Z
DTEND:20261019T010000Z
SUMMARY:Meeting
END:VEVENT
BEGIN:VEVENT
UID:outside
DTSTART;VALUE=DATE:20260901
DTEND;VALUE=DATE:20261001
SUMMARY:Previous month
END:VEVENT`.replace(/\n/g,'\r\n')),2026,10);
  assert.equal(events.length,2);
  const allDay = events.find(event=>event.allDay);
  assert.equal(allDay.title,'School, Events');
  assert.equal(allDay.description,'First line\nSecond line with folded text');
  assert.equal(allDay.end,'2026-10-21');
  assert.equal(allDay.location,'Hall');
  assert.equal(events.find(event=>!event.allDay).start,'2026-10-18T23:00:00.000Z');
  assert.equal(new URL(GOOGLE_URL).searchParams.get('cid'),SOURCE_URL.replace('https:','webcal:'));
});

test('KAMAR recurrences honour exclusions, changed occurrences and cancellations', () => {
  const events = parseCalendar(wrap(`BEGIN:VEVENT
UID:weekly
DTSTART;VALUE=DATE:20261005
DTEND;VALUE=DATE:20261006
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;VALUE=DATE:20261012
SUMMARY:Weekly event
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;VALUE=DATE:20261019
DTSTART;VALUE=DATE:20261020
DTEND;VALUE=DATE:20261021
SUMMARY:Moved event
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART;VALUE=DATE:20261008
DTEND;VALUE=DATE:20261009
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT`.replace(/\n/g,'\r\n')),2026,10);
  assert.deepEqual(events.map(event=>[event.start,event.title]),[
    ['2026-10-05','Weekly event'],['2026-10-20','Moved event'],['2026-10-26','Weekly event']
  ]);
});

test('day selection uses New Zealand dates and excludes the all-day end date', async () => {
  const fs = require('node:fs/promises'), vm = require('node:vm');
  const source = await fs.readFile(require('node:path').join(__dirname,'public','planner.js'),'utf8');
  const helper = source.slice(source.indexOf('  function kamarEventDate('),source.indexOf('  function renderKamarCalendar('));
  const context = {};
  vm.runInNewContext(helper,context);
  const events = [
    {title:'Trip',start:'2026-10-19',end:'2026-10-21',allDay:true},
    {title:'Noon',start:'2026-10-18T23:00:00.000Z',end:'2026-10-19T01:00:00.000Z',allDay:false}
  ];
  assert.equal(context.kamarEventsForDay(events,'2026-10-19').length,2);
  assert.equal(context.kamarEventsForDay(events,'2026-10-20').length,1);
  assert.equal(context.kamarEventsForDay(events,'2026-10-21').length,0);
  assert.equal(context.kamarEventsForDay(events,'2026-10-18').length,0);
  assert.equal(context.kamarEventsForDay([
    {start:'2026-10-19T08:00:00.000Z',end:'2026-10-19T11:00:00.000Z',allDay:false}
  ],'2026-10-20').length,0);
});

test('calendar defaults to today in New Zealand, otherwise the first of the displayed month', async () => {
  const fs = require('node:fs/promises'), vm = require('node:vm');
  const source = await fs.readFile(require('node:path').join(__dirname,'public','planner.js'),'utf8');
  const helper = source.slice(source.indexOf('  function kamarToday('),source.indexOf('  function renderKamarCalendar('));
  const context = {};
  vm.runInNewContext(helper,context);
  const now = new Date('2026-10-17T12:30:00Z');
  assert.equal(context.kamarToday(now),'2026-10-18');
  assert.equal(context.kamarDefaultDate(2026,10,now),'2026-10-18');
  assert.equal(context.kamarDefaultDate(2026,11,now),'2026-11-01');
  assert.equal(context.kamarDefaultDate(2027,1,now),'2027-01-01');
  assert.equal(context.kamarDefaultDate(2027,1,new Date('2026-12-31T12:30:00Z')),'2027-01-01');
  assert.match(source,/showDay\(personal \?/);
  assert.match(source,/: kamarDefaultDate\(selectedYear, month\)\)/);
});

test('weekly timetable limits each hour to three class lines with accurate NZ time boundaries', async () => {
  const fs = require('node:fs/promises'), vm = require('node:vm');
  const source = await fs.readFile(require('node:path').join(__dirname,'public','planner.js'),'utf8');
  const helpers = source.slice(source.indexOf('  function kamarEventDate('),source.indexOf('  function renderKamarCalendar('));
  const el = (tag,text='',attrs={})=>({
    tag,text,attrs,children:[],style:{},dataset:{date:attrs['data-date'],hour:attrs['data-hour']},
    append(...nodes){this.children.push(...nodes);},addEventListener(event,handler){this[event]=handler;}
  });
  const context = {el,date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10)};
  vm.runInNewContext(helpers,context);
  assert.equal(context.kamarSunday('2026-10-21'),'2026-10-18');
  assert.equal(context.kamarSunday('2026-10-18'),'2026-10-18');
  assert.equal(context.kamarSunday('2027-01-01'),'2026-12-27');
  assert.equal(context.kamarWeekDates('2026-12-27').join(','),'2026-12-27,2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02');
  const events = [
    {title:'Whānau',start:'2026-10-18T19:45:00.000Z',end:'2026-10-18T20:00:00.000Z',allDay:false},
    {title:'Lesson',start:'2026-10-19T09:00:00',end:'2026-10-19T10:00:00',allDay:false},
    {title:'Overlap',start:'2026-10-19T09:30:00',end:'2026-10-19T10:30:00',allDay:false},
    {title:'Early',start:'2026-10-19T07:00:00',end:'2026-10-19T08:15:00',allDay:false},
    {title:'Late',start:'2026-10-19T16:30:00',end:'2026-10-19T18:00:00',allDay:false},
    {title:'Evening',start:'2026-10-19T18:00:00',end:'2026-10-19T19:00:00',allDay:false},
    {title:'All day',start:'2026-10-19',end:'2026-10-20',allDay:true},
    ...Array.from({length:4},(_,index)=>({title:'Extra class '+index,start:'2026-10-19T09:15:00',end:'2026-10-19T09:45:00',allDay:false}))
  ];
  const layout=context.kamarWeekLayout(events,'2026-10-19');
  assert.equal(layout.length,9);
  assert.equal(layout[0].start,480);
  assert.equal(layout.at(-1).end,1020);
  assert.equal(layout.find(item=>item.event.title==='Whānau').start,525);
  assert.equal(context.kamarHourEvents(events,'2026-10-19',9).length,6);
  assert.equal(context.kamarHourEvents(events,'2026-10-19',10).length,1);
  assert.equal(context.kamarHourEvents(events,'2026-10-19',8).length,2);
  const buttons=[],selected=[];
  const scroll=context.renderKamarWeek(events,'2026-10-18',(value,hour)=>selected.push([value,hour]),buttons);
  const grid=scroll.children[0];
  assert.equal(buttons.length,70);
  assert.ok(buttons[0].text.startsWith('Sun'));
  assert.ok(buttons[6].text.startsWith('Sat'));
  buttons[1].click();
  assert.equal(selected[0][0],'2026-10-19');
  const times=grid.children.filter(node=>node.attrs.class.includes('kamar-week-time'));
  assert.equal(times.length,10);
  assert.equal(times[0].text,'8am');
  assert.equal(times.at(-1).text,'5pm');
  const hours=grid.children.filter(node=>node.attrs.class==='kamar-week-hour');
  assert.equal(hours.length,63);
  const nine=hours.find(node=>node.dataset.date==='2026-10-19'&&node.dataset.hour==='9');
  assert.equal(nine.children.filter(node=>node.attrs.class==='kamar-hour-class').length,3);
  assert.equal(nine.children.at(-1).text,'+3 more');
  nine.click();
  assert.deepEqual(selected.at(-1),['2026-10-19',9]);
  const empty=hours.find(node=>node.dataset.date==='2026-10-18'&&node.dataset.hour==='9');
  assert.equal(empty.children.length,0);
  assert.equal(grid.children.filter(node=>node.attrs.class==='kamar-week-extra')[1].children.length,2);
});

test('weekly calendar loads both boundary months once and deduplicates spanning lessons', async () => {
  const fs = require('node:fs/promises'), vm = require('node:vm');
  const source = await fs.readFile(require('node:path').join(__dirname,'public','planner.js'),'utf8');
  const helpers = source.slice(source.indexOf('  function kamarEventDate('),source.indexOf('  function renderTeacherTimetable('));
  const el = (tag,text='',attrs={})=>({
    tag,textContent:text,attrs,children:[],style:{},dataset:{date:attrs['data-date'],hour:attrs['data-hour']},isConnected:true,
    classList:{add(){}},
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    prepend(...nodes){this.children.unshift(...nodes);},
    setAttribute(key,value){this.attrs[key]=value;},addEventListener(event,handler){this[event]=handler;}
  });
  const host=el('div'),requests=[];
  const event={id:'boundary',title:'Spanning lesson',start:'2026-05-31T09:00:00',end:'2026-06-02T10:00:00',allDay:false};
  class FixtureDate extends Date { constructor(...args){super(...(args.length ? args : ['2026-05-31T00:00:00Z']));} }
  const context={
    el,year:2026,api:'/api/planner/',Date:FixtureDate,
    date:value=>new Date(value+'T00:00:00Z'),iso:value=>value.toISOString().slice(0,10),
    host,request:async url=>{requests.push(url);return {events:[event],fetchedAt:'2026-05-31T00:00:00Z'};}
  };
  vm.runInNewContext(helpers+'\nrenderKamarCalendar(host,{personal:true,feed:"https://westlandhigh.school.kiwi/ics/TEST-FIXTURE.ics"});',context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests,['/api/planner/kamar-timetable/2026/5','/api/planner/kamar-timetable/2026/6']);
  const [controls,body]=host.children;
  const grid=body.children.find(node=>node.attrs.class==='kamar-week-layout').children[0].children[0];
  assert.equal(grid.children.filter(node=>node.attrs.class==='kamar-week-heading').find(node=>node.attrs['aria-pressed']==='true').dataset.date,'2026-05-31');
  const sundayNine=grid.children.find(node=>node.dataset.date==='2026-05-31'&&node.dataset.hour==='9');
  assert.equal(sundayNine.children.length,1);
  sundayNine.click();
  const details=body.children.find(node=>node.attrs.class==='kamar-week-layout').children[1];
  assert.ok(details.children[0].textContent.includes('9am–10am'));
  assert.equal(details.children.filter(node=>node.tag==='article').length,1);
  assert.equal(controls.children[0].textContent,'Previous week');
  assert.equal(controls.children[2].textContent,'Next week');
  controls.children[2].click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.at(-1),'/api/planner/kamar-timetable/2026/6');
  const nextGrid=body.children.find(node=>node.attrs.class==='kamar-week-layout').children[0].children[0];
  assert.equal(nextGrid.children.filter(node=>node.attrs.class==='kamar-week-heading')[0].dataset.date,'2026-06-07');
  assert.equal(nextGrid.children.filter(node=>node.attrs.class==='kamar-week-hour').flatMap(node=>node.children).length,0);
});

test('invalid calendar documents fail instead of appearing as an empty calendar', () => {
  assert.throws(()=>parseCalendar('<html>Unavailable</html>',2026,10));
  assert.throws(()=>parseCalendar('BEGIN:VEVENT\r\nSUMMARY:Not a calendar\r\nEND:VEVENT',2026,10));
});

test('public feed fetch fails explicitly, retries, and caches successful reads', async t => {
  let calls=0;
  const mock = t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,SOURCE_URL);
    calls++;
    if(calls===1) return {ok:false,status:503};
    return {ok:true,text:async()=>wrap('BEGIN:VEVENT\r\nUID:public\r\nDTSTART;VALUE=DATE:20261019\r\nSUMMARY:Public school event\r\nEND:VEVENT')};
  });
  await assert.rejects(loadCalendar(2026,10),/503/);
  const calendar = await loadCalendar(2026,10);
  assert.equal(calendar.events[0].title,'Public school event');
  assert.equal(calendar.events[0].end,'2026-10-20');
  assert.equal(calendar.sourceUrl,SOURCE_URL);
  await loadCalendar(2026,11);
  assert.equal(mock.mock.callCount(),2);
});
