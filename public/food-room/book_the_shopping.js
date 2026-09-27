function getNormalizedSelectedBookingIds() {
        const raw = Array.isArray(window.selectedBookingIds) ? window.selectedBookingIds : [];
        return [...new Set(raw
                .map(id => parseInt(id, 10))
                .filter(id => Number.isInteger(id) && id > 0))];
}

const shoppingUserLocale = (navigator.languages && navigator.languages[0]) || navigator.language || undefined;
const shoppingDateFormatter = new Intl.DateTimeFormat(shoppingUserLocale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
});

function toIsoDate(dateObj) {
    const date = new Date(dateObj);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateDMY(dateObj) {
    return shoppingDateFormatter.format(new Date(dateObj));
}

function getTeacherListDisplayIngredient(item) {
    return item.stripFoodItem || item.ingredient || item.fooditem || '';
}

function mondayToIsoWeekValue(mondayDate) {
    const monday = new Date(mondayDate);
    monday.setHours(0, 0, 0, 0);
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const year = thursday.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day + 1);
    const diffDays = Math.round((monday - week1Monday) / 86400000);
    const weekNo = Math.floor(diffDays / 7) + 1;
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

function isoWeekValueToMonday(weekValue) {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekValue || '');
    if (!match) return null;
    const year = Number(match[1]);
    const weekNo = Number(match[2]);
    if (weekNo < 1 || weekNo > 53) return null;
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day + 1);
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + ((weekNo - 1) * 7));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function askWeekForAutoList(defaultMonday) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.2);padding:1rem 1.1rem;min-width:320px;max-width:90vw;';
        box.innerHTML = `
          <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.65rem;">Auto Week List + Print</div>
          <label for="autoWeekListInput" style="display:block;margin-bottom:0.35rem;">Which week do you want?</label>
          <input id="autoWeekListInput" type="week" value="${mondayToIsoWeekValue(defaultMonday)}" style="width:100%;padding:0.4rem;margin-bottom:0.8rem;" />
          <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
            <button id="autoWeekCancelBtn" style="padding:0.42rem 0.8rem;border:1px solid #bbb;background:#f2f2f2;border-radius:5px;">Cancel</button>
            <button id="autoWeekConfirmBtn" style="padding:0.42rem 0.8rem;border:0;background:#6a1b9a;color:#fff;border-radius:5px;">Generate + Print</button>
          </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const cleanup = () => overlay.remove();
        box.querySelector('#autoWeekCancelBtn').onclick = () => {
            cleanup();
            resolve(null);
        };
        box.querySelector('#autoWeekConfirmBtn').onclick = () => {
            const monday = isoWeekValueToMonday(box.querySelector('#autoWeekListInput').value);
            cleanup();
            resolve(monday);
        };
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                cleanup();
                resolve(null);
            }
        });
    });
}

async function getBookingIdsForWeek(mondayDate) {
    const response = await fetch('/api/bookings/all');
    if (!response.ok) {
        throw new Error('Could not load bookings for selected week.');
    }
    const payload = await response.json();
    const bookings = Array.isArray(payload.bookings) ? payload.bookings : [];

    const isoDates = new Set();
    for (let i = 0; i < 7; i++) {
        const d = new Date(mondayDate);
        d.setDate(mondayDate.getDate() + i);
        isoDates.add(toIsoDate(d));
    }

    return bookings
        .filter(b => isoDates.has(String(b.booking_date || '').slice(0, 10)))
        .map(b => parseInt(b.id, 10))
        .filter(id => Number.isInteger(id) && id > 0);
}

function renderTeacherListHtmlByData(data) {
    if (!(data && data.success && data.data && Object.keys(data.data).length > 0)) {
        return '<em>No shopping list data returned.</em>';
    }
    let html = '<div style="margin-bottom:2em;max-width:900px;margin-left:auto;margin-right:auto;">';
    for (const teacherKey of Object.keys(data.data)) {
        html += '<div style="margin-bottom:2em;">';
        html += `<div style="font-weight:bold;font-size:1.15em;margin-bottom:0.7em;color:#1976d2;">${teacherKey}</div>`;
        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;table-layout:fixed;">';
        html += '<colgroup><col style="width:10%;"><col style="width:12%;"><col style="width:78%;"></colgroup>';
        html += '<thead><tr style="background:#e3e3e3;">';
        html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
        html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
        html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
        html += '</tr></thead><tbody>';
        let rowNum = 0;
        for (const item of data.data[teacherKey]) {
            html += `<tr style="background:${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'}">`;
            html += `<td style="padding:0.5em 0.6em;text-align:right;">${item.qty || ''}</td>`;
            html += `<td style="padding:0.5em 0.6em;">${item.unit || ''}</td>`;
            html += `<td style="padding:0.5em 0.8em;">${getTeacherListDisplayIngredient(item)}</td>`;
            html += '</tr>';
            rowNum++;
        }
        html += '</tbody></table></div>';
    }
    html += '</div>';
    return html;
}

function renderCategoryListHtmlByData(data) {
    if (!(data && data.success && data.data)) {
        return '<em>No shopping list data returned.</em>';
    }
    const aisleOrder = ['Produce', 'Dairy', 'Pantry', 'Other', 'Action'];
    let html = '';
    for (const cat of aisleOrder) {
        if (data.data[cat] && data.data[cat].length > 0) {
            const sortedItems = data.data[cat]
                .slice()
                .sort((a, b) => String(a.display || '').localeCompare(String(b.display || ''), undefined, { sensitivity: 'base' }));
            html += `<h4 style="margin-bottom:0.3em;">${cat}</h4>`;
            html += '<table class="shopping-category-table" style="margin-bottom:1em;width:100%;border-collapse:collapse;table-layout:fixed;">';
            html += '<colgroup><col style="width:10%;"><col style="width:12%;"><col style="width:78%;"></colgroup>';
            html += '<thead><tr style="background:#e3e3e3;">';
            html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
            html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
            html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
            html += '</tr></thead><tbody>';
            sortedItems.forEach((item, idx) => {
                html += `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f6f8fa'}">`;
                html += `<td style="padding:0.5em 0.6em;text-align:right;">${item.qty}</td>`;
                html += `<td style="padding:0.5em 0.6em;">${item.unit}</td>`;
                html += `<td style="padding:0.5em 0.8em;">${item.display}</td>`;
                html += '</tr>';
            });
            html += '</tbody></table>';
        }
    }
    return html || '<em>No items found for selected bookings.</em>';
}

function printCombinedWeekLists(teacherHtml, categoryHtml, mondayDate) {
    const weekStart = new Date(mondayDate);
    const weekEnd = new Date(mondayDate);
    weekEnd.setDate(weekStart.getDate() + 6);
    const printDate = new Date().toLocaleDateString();
    const weekLabel = formatDateDMY(weekStart) + ' to ' + formatDateDMY(weekEnd);
    const logoUrl = window.location.origin + '/images/whs%20logo%20circular%20reo%20.png';

    const win = window.open('', '', 'width=1100,height=800');
    if (!win) {
        alert('Please allow pop-ups to print the weekly lists.');
        return;
    }
    win.document.write('<!DOCTYPE html><html><head><title>Auto Week List - ' + weekLabel + '</title>');
    win.document.write('<style>');
    win.document.write('@page{margin:2.8cm 1.5cm 1.8cm 1.5cm;}');
    win.document.write('@page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:8pt;color:#555;}}');
    win.document.write('body{font-family:sans-serif;margin:0;padding:0;}');
    win.document.write('.running-header{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;gap:0.6em;padding:0.3em 0.8em 0.4em;border-bottom:2px solid #1a237e;background:#fff;font-size:9pt;}');
    win.document.write('.running-header img{height:40px;width:40px;object-fit:contain;}');
    win.document.write('.running-header-title{font-weight:700;font-size:11pt;flex:1;color:#1a237e;}');
    win.document.write('.running-header-meta{color:#555;font-size:8.5pt;text-align:right;white-space:nowrap;}');
    win.document.write('.body-content{padding-top:3.8em;-webkit-box-decoration-break:clone;box-decoration-break:clone;}');
    win.document.write('h2,h3{margin:0.5em 0;}');
    win.document.write('table{width:100%;border-collapse:collapse;page-break-inside:auto;}');
    win.document.write('thead{display:table-header-group;}');
    win.document.write('tr,th,td{break-inside:avoid;page-break-inside:avoid;}');
    win.document.write('th,td{border:1px solid #888;padding:0.3em 0.7em;}');
    win.document.write('th{background:#e3e3e3;}');
    win.document.write('tr:nth-child(even){background:#f6f8fa;}');
    win.document.write('.section{margin-bottom:1.8em;}');
    win.document.write('.teacher-section{padding-top:3.2em;-webkit-box-decoration-break:clone;box-decoration-break:clone;}');
    win.document.write('.teacher-section > h2{break-after:avoid;page-break-after:avoid;}');
    win.document.write('.teacher-section > div{break-inside:avoid;page-break-inside:avoid;}');
    win.document.write('.category-section{break-before:page;page-break-before:always;padding-top:3.4em;}');
    win.document.write('.category-section h4,.category-section table{break-inside:avoid;page-break-inside:avoid;}');
    win.document.write('</style>');
    win.document.write('</head><body>');
    win.document.write('<div class="running-header">');
    win.document.write('<img src="' + logoUrl + '" alt="WHS Logo" />');
    win.document.write('<span class="running-header-title">Weekly Shopping Lists — Auto Week List</span>');
    win.document.write('<span class="running-header-meta">Week: ' + weekLabel + '&nbsp;&nbsp;|&nbsp;&nbsp;Printed: ' + printDate + '</span>');
    win.document.write('</div>');
    win.document.write('<div class="body-content">');
    win.document.write('<div class="section teacher-section"><h2>Shopping List by Teacher</h2>' + teacherHtml + '</div>');
    win.document.write('<div class="section category-section"><h2>Shopping List by Category</h2>' + categoryHtml + '</div>');
    win.document.write('</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
}

// Helper to get selected bookings as HTML
function getSelectedBookingsHTML() {
    const sel = document.querySelector('.shopping-app .calendar-app + div') || document.querySelector('.shopping-app');
    const links = Array.from(document.querySelectorAll('.shopping-app a')).map(a => `<li>${a.outerHTML}</li>`).join('');
    return `<div style="margin-bottom:1em;"><strong>Selected Bookings</strong><ul>${links}</ul></div>`;
}

// Helper to get week label
function getWeekLabel() {
    const label = document.getElementById('calendarWeekLabel');
    return label ? `<div style='margin-bottom:1em;'><strong>Week:</strong> ${label.textContent}</div>` : '';
}

// Print function for a given area
function printArea(areaId, title, extraTitle) {
    const area = document.getElementById(areaId);
    if (!area) return;
    const win = window.open('', '', 'width=900,height=700');
    const printDate = new Date().toLocaleDateString();
    let fullTitle = title || 'Print';
    if (extraTitle) fullTitle += ' - ' + extraTitle;
    fullTitle += ' - ' + printDate;
    const logoUrl = window.location.origin + '/images/whs%20logo%20circular%20reo%20.png';
    const weekLabelEl = document.getElementById('calendarWeekLabel');
    const weekText = weekLabelEl ? 'Week: ' + weekLabelEl.textContent.trim() : '';
    const selectedBookingsHtml = getSelectedBookingsHTML();
    win.document.write('<!DOCTYPE html><html><head><title>' + fullTitle + '</title>');
    win.document.write('<style>');
    win.document.write('@page{margin:2.8cm 1.5cm 1.8cm 1.5cm;}');
    win.document.write('@page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:8pt;color:#555;}}');
    win.document.write('body{font-family:sans-serif;margin:0;padding:0;}');
    win.document.write('.running-header{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;gap:0.6em;padding:0.3em 0.8em 0.4em;border-bottom:2px solid #1a237e;background:#fff;font-size:9pt;}');
    win.document.write('.running-header img{height:40px;width:40px;object-fit:contain;}');
    win.document.write('.running-header-title{font-weight:700;font-size:11pt;flex:1;color:#1a237e;}');
    win.document.write('.running-header-meta{color:#555;font-size:8.5pt;text-align:right;white-space:nowrap;}');
    win.document.write('.body-content{padding-top:3.8em;-webkit-box-decoration-break:clone;box-decoration-break:clone;}');
    win.document.write('h2,h3{margin:0.5em 0;}');
    win.document.write('table{width:100%;border-collapse:collapse;page-break-inside:auto;}');
    win.document.write('thead{display:table-header-group;}');
    win.document.write('tr,th,td{break-inside:avoid;page-break-inside:avoid;}');
    win.document.write('th,td{border:1px solid #888;padding:0.3em 0.7em;}');
    win.document.write('th{background:#e3e3e3;}');
    win.document.write('tr:nth-child(even){background:#f6f8fa;}');
    win.document.write('.section{margin-bottom:1.5em;}');
    win.document.write('.print-bookings{margin-bottom:1em;}');
    win.document.write('.print-list{margin-top:0.3em;padding-top:3.2em;-webkit-box-decoration-break:clone;box-decoration-break:clone;}');
    win.document.write('.print-bookings-dedicated-page{break-after:page;page-break-after:always;min-height:calc(100vh - 4.4em);}');
    win.document.write('.start-on-new-page{break-before:page;page-break-before:always;}');
    win.document.write('.print-list .shopping-panel-title{display:none;}');
    win.document.write('.print-list #by-teacher-ingredients > div > div{break-inside:avoid;page-break-inside:avoid;}');
    win.document.write('.print-list .shopping-category-table{break-inside:avoid;page-break-inside:avoid;}');
    win.document.write('.print-list h4{break-after:avoid;page-break-after:avoid;}');
    win.document.write('</style>');
    win.document.write('</head><body>');
    win.document.write('<div class="running-header">');
    win.document.write('<img src="' + logoUrl + '" alt="WHS Logo" />');
    win.document.write('<span class="running-header-title">' + (title || 'Weekly Shopping List') + (extraTitle ? ' — ' + extraTitle : '') + '</span>');
    win.document.write('<span class="running-header-meta">' + (weekText ? weekText + '&nbsp;&nbsp;|&nbsp;&nbsp;' : '') + 'Printed: ' + printDate + '</span>');
    win.document.write('</div>');
    win.document.write('<div class="body-content">');
    win.document.write('<div class="print-bookings print-bookings-dedicated-page">' + selectedBookingsHtml + '</div>');
    win.document.write('<div id="printArea" class="print-list start-on-new-page">' + area.innerHTML + '</div>');
    win.document.write('</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(()=>{ win.print(); }, 300);
}

document.addEventListener('DOMContentLoaded',()=>{
    // Tab switching logic
        // Print buttons
        const printByTeacherBtn = document.getElementById('printByTeacherBtn');
        if (printByTeacherBtn) {
            printByTeacherBtn.onclick = function() {
                // Get all teacher headings in the rendered HTML (should be only the teacher name, not table headers)
                const teacherHeaders = document.querySelectorAll('#by-teacher-ingredients > div > div');
                let teacherName = '';
                if (teacherHeaders.length === 1) {
                    teacherName = teacherHeaders[0].childNodes[0] ? teacherHeaders[0].childNodes[0].textContent.trim() : teacherHeaders[0].textContent.trim();
                } else if (teacherHeaders.length > 1) {
                    teacherName = 'Multiple Teachers';
                } else {
                    teacherName = '';
                }
                // Remove any problematic characters for filenames
                teacherName = teacherName.replace(/[^a-zA-Z0-9 _\-()]/g, '');
                printArea('printByTeacherArea', 'Shopping List by Teacher', teacherName);
            };
        }
        const printByCategoryBtn = document.getElementById('printByCategoryBtn');
        if (printByCategoryBtn) {
            printByCategoryBtn.onclick = function() {
                printArea('printByCategoryArea', 'Shopping List by Category');
            };
        }
    const tabByTeacher = document.getElementById('tabByTeacher');
    const tabByCategory = document.getElementById('tabByCategory');
    const tabContentByTeacher = document.getElementById('tabContentByTeacher');
    const tabContentByCategory = document.getElementById('tabContentByCategory');
    tabByTeacher.onclick = function() {
        tabByTeacher.classList.add('active');
        tabByCategory.classList.remove('active');
        tabContentByTeacher.style.display = '';
        tabContentByCategory.style.display = 'none';
    };
    tabByCategory.onclick = function() {
        tabByCategory.classList.add('active');
        tabByTeacher.classList.remove('active');
        tabContentByCategory.style.display = '';
        tabContentByTeacher.style.display = 'none';
    };

    // Wire up Generate Shopping List by Teacher button
    const btnTeacher = document.getElementById('generateByTeacherBtn');
    if (btnTeacher) {
        btnTeacher.onclick = async function() {
            const bookingIds = getNormalizedSelectedBookingIds();
            if (!bookingIds.length) {
                if (window.QC) window.QC.toast('Please select at least one booking from the calendar', 'warn');
                else alert('Please select at least one booking from the calendar.');
                return;
            }
            const container = document.getElementById('by-teacher-ingredients');
            if (container) {
                container.innerHTML = '<em>Loading shopping list...</em>';
            }
            try {
                const response = await fetch(`/api/ingredients/shopping_list/by_teacher?booking_ids=${bookingIds.join(',')}`);
                if (!response.ok) {
                    throw new Error('API request failed with status ' + response.status);
                }
                const data = await response.json();
                if (container) {
                    if (data && data.success && data.data && Object.keys(data.data).length > 0) {
                        let html = '<div style="margin-bottom:2em;max-width:900px;margin-left:auto;margin-right:auto;">';
                        for (const teacherKey of Object.keys(data.data)) {
                            html += `<div style="margin-bottom:2em;">`;
                            html += `<div style="font-weight:bold;font-size:1.15em;margin-bottom:0.7em;color:#1976d2;">${teacherKey}</div>`;
                            html += '<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;table-layout:fixed;">';
                            html += '<colgroup><col style="width:10%;"><col style="width:12%;"><col style="width:78%;"></colgroup>';
                            html += '<thead><tr style="background:#e3e3e3;">';
                            html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
                            html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
                            html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
                            html += '</tr></thead><tbody>';
                            let rowNum = 0;
                            for (const item of data.data[teacherKey]) {
                                html += `<tr style="background:${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'}">`;
                                html += `<td style="padding:0.5em 0.6em;text-align:right;">${item.qty || ''}</td>`;
                                html += `<td style="padding:0.5em 0.6em;">${item.unit || ''}</td>`;
                                html += `<td style="padding:0.5em 0.8em;">${getTeacherListDisplayIngredient(item)}</td>`;
                                html += '</tr>';
                                rowNum++;
                            }
                            html += '</tbody></table>';
                            html += '</div>';
                        }
                        html += '</div>';
                        container.innerHTML = html;
                        if (window.QC) window.QC.toast('Shopping list by teacher generated', 'success');
                    } else {
                        container.innerHTML = '<em>No shopping list data returned.</em>';
                        if (window.QC) window.QC.toast('No shopping list data returned for selected bookings', 'warn');
                    }
                }
            } catch (err) {
                console.error('[ERROR] Fetching shopping list failed:', err);
                if (window.QC) window.QC.toast('Error generating shopping list by teacher', 'error');
                if (container) {
                    container.innerHTML = '<span style="color:red">Error fetching shopping list: ' + err.message + '</span>';
                }
            }
        };
    }

    // Wire up Generate Shopping List by Category button
    const btnCat = document.getElementById('generateByCategoryBtn');
    if (btnCat) {
        btnCat.onclick = async function() {
            const bookingIds = getNormalizedSelectedBookingIds();
            const container = document.getElementById('by-category-ingredients');
            if (!bookingIds.length) {
                if (container) container.innerHTML = '<em>Please select at least one booking from the calendar.</em>';
                if (window.QC) window.QC.toast('Please select at least one booking from the calendar', 'warn');
                return;
            }
            if (container) container.innerHTML = '<em>Loading shopping list by category...</em>';
            try {
                const response = await fetch(`/api/ingredients/shopping_list/by_category?booking_ids=${bookingIds.join(',')}`);
                if (!response.ok) {
                    throw new Error('API request failed with status ' + response.status);
                }
                const data = await response.json();
                if (container) {
                    if (data && data.success && data.data) {
                        let html = '';
                        const aisleOrder = ['Produce','Dairy','Pantry','Other','Action'];
                        for (const cat of aisleOrder) {
                            if (data.data[cat] && data.data[cat].length > 0) {
                                const sortedItems = data.data[cat]
                                    .slice()
                                    .sort((a, b) => String(a.display || '').localeCompare(String(b.display || ''), undefined, { sensitivity: 'base' }));
                                html += `<h4 style="margin-bottom:0.3em;">${cat}</h4>`;
                                html += '<table class="shopping-category-table" style="margin-bottom:1em;width:100%;border-collapse:collapse;table-layout:fixed;">';
                                html += '<colgroup><col style="width:10%;"><col style="width:12%;"><col style="width:78%;"></colgroup>';
                                html += '<thead><tr style="background:#e3e3e3;">';
                                html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
                                html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
                                html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
                                html += '</tr></thead><tbody>';
                                sortedItems.forEach((item, idx) => {
                                    html += `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f6f8fa'}">`;
                                    html += `<td style="padding:0.5em 0.6em;text-align:right;">${item.qty}</td>`;
                                    html += `<td style="padding:0.5em 0.6em;">${item.unit}</td>`;
                                    html += `<td style="padding:0.5em 0.8em;">${item.display}</td>`;
                                    html += '</tr>';
                                });
                                html += '</tbody></table>';
                            }
                        }
                        if (!html) html = '<em>No items found for selected bookings.</em>';
                        container.innerHTML = html;
                        if (window.QC) window.QC.toast('Shopping list by category generated', 'success');
                    } else {
                        container.innerHTML = '<em>No shopping list data returned.</em>';
                        if (window.QC) window.QC.toast('No shopping list data returned for selected bookings', 'warn');
                    }
                }
            } catch (err) {
                console.error('[ERROR] Fetching shopping list by category failed:', err);
                if (window.QC) window.QC.toast('Error generating shopping list by category', 'error');
                if (container) {
                    container.innerHTML = '<span style="color:red">Error fetching shopping list: ' + err.message + '</span>';
                }
            }
        };
    }

    const autoWeekListBtn = document.getElementById('autoWeekListBtn');
    if (autoWeekListBtn) {
        autoWeekListBtn.onclick = async function() {
            try {
                const defaultMonday = (typeof currentMonday !== 'undefined' && currentMonday) ? new Date(currentMonday) : new Date();
                const selectedMonday = await askWeekForAutoList(defaultMonday);
                if (!selectedMonday) return;

                const weekBookingIds = await getBookingIdsForWeek(selectedMonday);
                if (!weekBookingIds.length) {
                    if (window.QC) window.QC.toast('No bookings found for the selected week', 'warn');
                    else alert('No bookings found for the selected week.');
                    return;
                }

                const byTeacherContainer = document.getElementById('by-teacher-ingredients');
                const byCategoryContainer = document.getElementById('by-category-ingredients');
                if (byTeacherContainer) byTeacherContainer.innerHTML = '<em>Loading shopping list...</em>';
                if (byCategoryContainer) byCategoryContainer.innerHTML = '<em>Loading shopping list by category...</em>';

                const [teacherRes, categoryRes] = await Promise.all([
                    fetch(`/api/ingredients/shopping_list/by_teacher?booking_ids=${weekBookingIds.join(',')}`),
                    fetch(`/api/ingredients/shopping_list/by_category?booking_ids=${weekBookingIds.join(',')}`)
                ]);
                if (!teacherRes.ok || !categoryRes.ok) {
                    throw new Error('Failed to load one or more shopping list endpoints.');
                }

                const [teacherData, categoryData] = await Promise.all([teacherRes.json(), categoryRes.json()]);
                const teacherHtml = renderTeacherListHtmlByData(teacherData);
                const categoryHtml = renderCategoryListHtmlByData(categoryData);

                if (byTeacherContainer) byTeacherContainer.innerHTML = teacherHtml;
                if (byCategoryContainer) byCategoryContainer.innerHTML = categoryHtml;

                printCombinedWeekLists(teacherHtml, categoryHtml, selectedMonday);
                if (window.QC) window.QC.toast('Auto week list generated and sent to print', 'success');
            } catch (err) {
                if (window.QC) window.QC.toast('Auto week list failed', 'error');
                else alert('Auto week list failed.');
                console.error('[ERROR] Auto week list failed:', err);
            }
        };
    }

    // Wire up tab switching for original/calculated view
    if(document.getElementById('tabOriginal')){
        document.getElementById('tabOriginal').onclick = ()=>{
            document.getElementById('tabOriginal').classList.add('active');
            document.getElementById('tabCalculated').classList.remove('active');
            renderCalcPanelContent('original');
        };
    }
    if(document.getElementById('tabCalculated')){
        document.getElementById('tabCalculated').onclick = ()=>{
            document.getElementById('tabCalculated').classList.add('active');
            document.getElementById('tabOriginal').classList.remove('active');
            renderCalcPanelContent('calculated');
        };
    }

    if (window.QC) {
        window.QC.addSanityButton('Book the Shopping', [
            {
                name: 'Selected booking ids available',
                run: async () => Array.isArray(window.selectedBookingIds)
            },
            {
                name: 'Teacher shopping endpoint reachable',
                run: async () => {
                    const ids = getNormalizedSelectedBookingIds();
                    if (!ids.length) return true;
                    return (await fetch(`/api/ingredients/shopping_list/by_teacher?booking_ids=${ids.join(',')}`)).ok;
                }
            },
            {
                name: 'Category shopping endpoint reachable',
                run: async () => {
                    const ids = getNormalizedSelectedBookingIds();
                    if (!ids.length) return true;
                    return (await fetch(`/api/ingredients/shopping_list/by_category?booking_ids=${ids.join(',')}`)).ok;
                }
            }
        ]);
    }
});

// Removed static renderCalendar and demo data to prevent overwriting dynamic calendar.
