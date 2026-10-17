import datetime
import os
import zipfile
import xml.etree.ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def _excel_serial_to_iso(value):
    try:
        serial = float(value)
    except (TypeError, ValueError):
        text = str(value or "").strip()
        if not text:
            return ""
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y"):
            try:
                dt = datetime.datetime.strptime(text, fmt)
                return dt.strftime("%Y-%m-%d 09:00")
            except ValueError:
                continue
        return ""

    # Excel's day 1 = 1899-12-31 with leap-year bug adjustment at 1900.
    base = datetime.datetime(1899, 12, 30)
    dt = base + datetime.timedelta(days=serial)
    return dt.strftime("%Y-%m-%d 09:00")


def _read_first_sheet(path):
    with zipfile.ZipFile(path) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        first_sheet = workbook.find(".//a:sheets/a:sheet", NS)
        if first_sheet is None:
            return []

        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        target = None
        for rel in rels:
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target")
                break
        if not target:
            return []

        sheet = ET.fromstring(zf.read("xl/" + target.replace("\\", "/")))

        shared = []
        if "xl/sharedStrings.xml" in zf.namelist():
            sst = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sst.findall("a:si", NS):
                shared.append("".join(t.text or "" for t in si.findall(".//a:t", NS)))

        rows = []
        for row in sheet.findall(".//a:sheetData/a:row", NS):
            values = []
            for cell in row.findall("a:c", NS):
                value_node = cell.find("a:v", NS)
                if value_node is None:
                    values.append("")
                    continue
                raw = value_node.text or ""
                if cell.attrib.get("t") == "s":
                    try:
                        raw = shared[int(raw)]
                    except (ValueError, IndexError):
                        raw = ""
                values.append(str(raw).strip())
            rows.append(values)
        return rows


def _find_header_index(rows):
    for idx, row in enumerate(rows):
        lowered = [str(v).strip().lower() for v in row]
        if "date" in lowered and "notes" in lowered:
            return idx
    return -1


def _cell(row, index):
    if index < 0 or index >= len(row):
        return ""
    return row[index]


def parse_student_workbook(path):
    rows = _read_first_sheet(path)
    if not rows:
        return None

    title = ""
    for row in rows:
        first = row[0].strip() if row else ""
        if first:
            title = first
            break
    if not title:
        title = os.path.splitext(os.path.basename(path))[0]

    header_idx = _find_header_index(rows)
    if header_idx == -1:
        return None

    header = [h.strip().lower() for h in rows[header_idx]]
    date_i = header.index("date") if "date" in header else -1
    type_i = header.index("type") if "type" in header else -1
    referral_i = header.index("referral") if "referral" in header else -1
    year_i = header.index("year level") if "year level" in header else -1
    class_i = header.index("classification") if "classification" in header else -1
    notes_i = header.index("notes") if "notes" in header else -1

    sessions = []
    merged_notes = []
    referral_counts = {}

    for row in rows[header_idx + 1 :]:
        date_raw = _cell(row, date_i)
        if not date_raw:
            continue

        session_iso = _excel_serial_to_iso(date_raw)
        if not session_iso:
            continue
        sessions.append(session_iso)

        referral_val = _cell(row, referral_i)
        if referral_val:
            key = referral_val.strip()
            referral_counts[key] = referral_counts.get(key, 0) + 1

        detail_parts = [
            f"Date: {session_iso[:10]}",
            f"Type: {_cell(row, type_i)}" if type_i >= 0 else "",
            f"Referral: {referral_val}" if referral_val else "",
            f"Year Level: {_cell(row, year_i)}" if year_i >= 0 else "",
            f"Classification: {_cell(row, class_i)}" if class_i >= 0 else "",
            f"Notes: {_cell(row, notes_i)}" if notes_i >= 0 else "",
        ]
        merged_notes.append(" | ".join(part for part in detail_parts if part))

    top_referral = ""
    if referral_counts:
        top_referral = max(referral_counts, key=referral_counts.get)

    slug = os.path.splitext(os.path.basename(path))[0].lower().replace(" ", "-")
    student_id = f"SYNC-{slug[:30]}"

    return {
        "student_id": student_id,
        "full_name": title,
        "preferred_name": "",
        "dob": "",
        "gender": "",
        "ethnicity": "",
        "address": "",
        "phone": "",
        "referral_type": top_referral,
        "whanau": "",
        "care_giver": "",
        "notes": "\n".join(merged_notes[:200]),
        "sessions": sorted(set(sessions)),
    }


def sync_spreadsheet_folder(folder_path, backend):
    if not os.path.isdir(folder_path):
        return {
            "imported": 0,
            "skipped": 0,
            "files": [f"Folder not found: {folder_path}"],
        }

    imported = 0
    skipped = 0
    details = []

    xlsx_files = [name for name in sorted(os.listdir(folder_path)) if name.lower().endswith(".xlsx")]
    if not xlsx_files:
        return {
            "imported": 0,
            "skipped": 0,
            "files": [f"No .xlsx files found in {folder_path}"],
        }

    for name in xlsx_files:
        full_path = os.path.join(folder_path, name)
        try:
            parsed = parse_student_workbook(full_path)
        except Exception as exc:
            skipped += 1
            details.append(f"Skipped {name}: {exc}")
            continue
        if not parsed:
            skipped += 1
            details.append(f"Skipped {name}: unsupported structure")
            continue

        try:
            backend.upsert_student(parsed["student_id"], parsed)
        except Exception as exc:
            skipped += 1
            details.append(f"Skipped {name}: database error ({exc})")
            continue
        imported += 1
        details.append(f"Imported {name} -> {parsed['student_id']}")

    return {"imported": imported, "skipped": skipped, "files": details}