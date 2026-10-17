

from flask import Blueprint, render_template, request, session, redirect, url_for
from flask import send_file, flash, jsonify
from flask_login import login_required, current_user
from app.models import Course, Enrollment, Assignment, Submission, Quiz, QuizAttempt, User, CommentCheck, Lesson
import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sqlalchemy import func
from sqlalchemy.orm import load_only
from datetime import datetime
import hashlib
from app import db
import base64
import json
import os
from email.mime.text import MIMEText

bp = Blueprint('main', __name__)

# Practice Submission History (Student)
@bp.route('/practice/history')
@login_required
def practice_history():
    from app.models import CommentCheck, DebugCheck, CommentFeedback
    max_checks = 100
    max_feedback_per_file = 200
    # Get all comment and debug checks for this user
    comment_checks = CommentCheck.query.filter_by(user_id=current_user.id).order_by(CommentCheck.checked_at.desc()).limit(max_checks).all()
    debug_checks = DebugCheck.query.filter_by(user_id=current_user.id).order_by(DebugCheck.checked_at.desc()).limit(max_checks).all()
    # For each comment check, get feedbacks by filename
    comment_feedbacks = {}
    for check in comment_checks:
        feedbacks = CommentFeedback.query.filter_by(user_id=current_user.id, filename=check.filename).order_by(CommentFeedback.line_num).limit(max_feedback_per_file).all()
        comment_feedbacks[check.filename] = feedbacks
    return render_template('practice/history.html', comment_checks=comment_checks, debug_checks=debug_checks, comment_feedbacks=comment_feedbacks)

# Contact teacher route
@bp.route('/contact_teacher', methods=['POST'])
@login_required
def contact_teacher():
    """Send a message to the teacher via email"""
    try:
        from sqlalchemy.exc import OperationalError
        
        # Get form data
        subject = request.form.get('subject', 'Question from Student')
        message = request.form.get('message', '')
        recipient_email = request.form.get('recipient_email')
        
        if not message or not recipient_email:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Handle potential database connection issues when accessing current_user
        try:
            student_name = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.username
        except OperationalError as db_error:
            print(f"[ERROR] Database connection error accessing user data: {str(db_error)}")
            student_name = current_user.username
        
        # Build email body
        body = f"""Hello,

I have a question from your student {student_name} ({current_user.email}):

---
{message}
---

Please reply to this email or contact the student directly.

Best regards,
Class Training System"""
        
        # Try Gmail API first if available
        email_sent = False
        try:
            from flask_dance.contrib.google import google
            
            if google.authorized:
                # Build the email message for Gmail API
                email_message = MIMEText(body)
                email_message['to'] = recipient_email
                email_message['from'] = current_user.email
                email_message['subject'] = f"[Class Training System] {subject}"
                
                raw_message = base64.urlsafe_b64encode(email_message.as_bytes()).decode()
                send_message = {'raw': raw_message}
                
                # Attempt to send with current token
                resp = google.post(
                    'https://www.googleapis.com/gmail/v1/users/me/messages/send',
                    json=send_message
                )
                
                if resp.ok:
                    print(f"[EMAIL] Successfully sent via Gmail API from {current_user.username} to {recipient_email}")
                    email_sent = True
                elif resp.status_code == 401:
                    print(f"[EMAIL] Google token expired for user {current_user.username}")
        except Exception as google_error:
            print(f"[EMAIL] Gmail API unavailable: {str(google_error)}")
        
        # If Gmail didn't work, try SMTP
        if not email_sent:
            try:
                import smtplib
                from email.mime.multipart import MIMEMultipart
                
                # Get SMTP configuration from environment
                smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
                smtp_port = int(os.environ.get('SMTP_PORT', 587))
                smtp_username = os.environ.get('SMTP_USERNAME')
                smtp_password = os.environ.get('SMTP_PASSWORD')
                smtp_from_email = os.environ.get('SMTP_FROM_EMAIL') or smtp_username
                
                if not smtp_username or not smtp_password:
                    print("[EMAIL] SMTP credentials not configured")
                else:
                    # Create email message
                    msg = MIMEMultipart()
                    msg['From'] = smtp_from_email
                    msg['To'] = recipient_email
                    msg['Subject'] = f"[Class Training System] {subject}"
                    msg.attach(MIMEText(body, 'plain'))
                    
                    # Send email via SMTP
                    with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
                        server.starttls()
                        server.login(smtp_username, smtp_password)
                        server.send_message(msg)
                    
                    print(f"[EMAIL] Successfully sent via SMTP from {current_user.username} to {recipient_email}")
                    email_sent = True
            except Exception as smtp_error:
                print(f"[EMAIL] SMTP error: {str(smtp_error)}")
                import traceback
                traceback.print_exc()
        
        # Return success message
        if email_sent:
            return jsonify({
                'success': True, 
                'message': 'Your message has been sent to your teacher!'
            }), 200
        else:
            # Fallback: log the message locally if all email methods fail
            print(f"[CONTACT_REQUEST] From: {student_name} ({current_user.email})")
            print(f"[CONTACT_REQUEST] To: {recipient_email}")
            print(f"[CONTACT_REQUEST] Subject: {subject}")
            print(f"[CONTACT_REQUEST] Message: {message}")
            
            return jsonify({
                'success': True, 
                'message': 'Your message has been received by the system.'
            }), 200
            
    except Exception as e:
        print(f"[ERROR] Contact teacher error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'An error occurred: {str(e)}'
        }), 500


# PDF download for extracted comments and feedback
@bp.route('/download_comments_pdf', methods=['POST'])
@login_required
def download_comments_pdf():
    from flask import make_response
    code = request.form.get('code', '')
    code_str = str(code) if code is not None else ""
    uploaded_filename = request.form.get('uploaded_filename', 'Extracted_Comments')
    today_str = datetime.now().strftime('%Y-%m-%d')
    pdf_filename = f"{uploaded_filename}_comments_{today_str}.pdf"
    # Compute code hash for strict filtering
    code_hash = hashlib.sha256(code_str.encode('utf-8')).hexdigest()
    # Unified logic: match web view
    comment_lines = []
    feedback_dict = {}
    already_checked = False
    from app.models import CommentFeedback, Lesson
    template_path = "modules/module3/m3lesson1.html"
    lesson = Lesson.query.filter_by(template_path=template_path).first()
    if lesson:
        lesson_id = lesson.id
        feedback_entries = CommentFeedback.query.filter_by(
            user_id=current_user.id,
            lesson_id=lesson_id,
            filename=uploaded_filename,
            code_hash=code_hash
        ).order_by(CommentFeedback.line_num).all()
        if feedback_entries:
            already_checked = True
            for entry in feedback_entries:
                comment_lines.append((entry.line_num, entry.comment))
                feedback_dict[entry.line_num] = entry.feedback
    if not already_checked:
        # Use session data if not checked
        comment_lines = session.get('comment_lines', [])
        feedback_dict = session.get('feedback_dict', {})
    # Generate PDF
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    y = height - 40
    p.setFont("Helvetica-Bold", 14)
    p.drawString(40, y, f"Extracted Comments for: {uploaded_filename}")
    y -= 24
    p.setFont("Helvetica", 12)
    p.drawString(40, y, f"Date: {today_str}")
    y -= 30
    p.setFont("Helvetica", 11)
    p.drawString(40, y, "Code:")
    y -= 18
    p.setFont("Courier", 9)
    for line in code.splitlines():
        if y < 60:
            p.showPage()
            y = height - 40
            p.setFont("Courier", 9)
        p.drawString(50, y, line)
        y -= 12
    y -= 18
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "Extracted Comments and Feedback:")
    y -= 18
    p.setFont("Helvetica", 10)
    if comment_lines:
        for idx, (line_num, comment) in enumerate(comment_lines):
            if y < 60:
                p.showPage()
                y = height - 40
                p.setFont("Helvetica", 10)
            p.drawString(50, y, f"Line {line_num}: {comment}")
            y -= 12
            p.setFont("Helvetica-Oblique", 9)
            feedback = feedback_dict.get(line_num, '(No feedback available)')
            p.drawString(70, y, f"Feedback: {feedback}")
            y -= 16
            p.setFont("Helvetica", 10)
    else:
        p.drawString(50, y, "No comments found.")
    p.save()
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=pdf_filename, mimetype='application/pdf')

# PDF download for extracted debug blocks and feedback (Lesson 2)
@bp.route('/lesson2/download_debug_feedback')
@login_required
def download_lesson2_debug_feedback():
    # Get debug blocks and feedback from session
    extracted_debug_blocks = session.get('lesson2_debug_blocks')
    uploaded_filename = session.get('uploaded_filename', 'Debug_Feedback')
    from datetime import datetime
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    if not extracted_debug_blocks:
        flash('No extracted debug blocks found. Please extract debug blocks first.', 'danger')
        return redirect(url_for('main.practice_debug_checker'))
    today = datetime.now().strftime('%Y-%m-%d')
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 50
    p.setFont("Helvetica-Bold", 16)
    p.drawString(50, y, f"{uploaded_filename}")
    y -= 30
    p.setFont("Helvetica", 12)
    p.drawString(50, y, f"Date: {today}")
    y -= 30
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, y, "Lesson 2: Debug Checker - Extracted Debug Blocks")
    y -= 40
    p.setFont("Helvetica", 12)
    from reportlab.lib.utils import simpleSplit
    max_width = width - 100
    for block in extracted_debug_blocks:
        if y < 80:
            p.showPage()
            y = height - 50
            p.setFont("Helvetica", 12)
        block_lines = simpleSplit(block, "Helvetica", 12, max_width)
        for line in block_lines:
            p.drawString(50, y, line)
            y -= 16
        # Automatic feedback logic
        feedback = []
        block_lower = block.lower()
        if '# debug:' in block_lower and ('test' not in block_lower and 'issue' not in block_lower and 'fix' not in block_lower):
            feedback.append('Add a test, issue, and fix description to your DEBUG block.')
        else:
            missing = []
            if 'test' not in block_lower:
                missing.append('TEST')
            if 'issue' not in block_lower:
                missing.append('ISSUE')
            if 'fix' not in block_lower:
                missing.append('FIX')
            if not missing:
                feedback.append('Great! Your DEBUG block is complete.')
            else:
                feedback.append(f"Add a {', '.join(missing)} to your DEBUG block for full marks.")
        p.setFillColorRGB(0.2,0.2,0.7)
        for fb in feedback:
            fb_lines = simpleSplit(f"Feedback: {fb}", "Helvetica", 12, max_width - 20)
            for line in fb_lines:
                p.drawString(70, y, line)
                y -= 16
        p.setFillColorRGB(0,0,0)
        y -= 10
    p.save()
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f"{uploaded_filename}_debug_blocks_{today}.pdf", mimetype="application/pdf")

# Extract debug blocks utility (move to top-level, not nested)
def extract_debug_blocks(code):
    """
    Extracts debug blocks in a flexible way, handling both # DEBUG: and # DEBUG TEST: starters,
    and sub-lines with or without DEBUG, in any order, case-insensitive.
    """
    import re
    debug_blocks = []
    lines = code.splitlines()
    i = 0
    debug_line_regex = re.compile(r'#\s*DEBUG(\b|\s|:)', re.IGNORECASE)
    while i < len(lines):
        line = lines[i].strip()
        # Start of a debug block: any line starting with # DEBUG (with or without subtype/colon/word)
        if debug_line_regex.match(line):
            block = [f"{i+1}: {lines[i].strip()}"]
            j = i + 1
            # Collect subsequent lines that also start with # DEBUG (with or without subtype/colon/word)
            while j < len(lines):
                subline = lines[j].strip()
                if debug_line_regex.match(subline):
                    block.append(f"{j+1}: {lines[j].strip()}")
                    j += 1
                else:
                    break
            debug_blocks.append('\n'.join(block))
            i = j
        else:
            i += 1
    return debug_blocks

# Debug Checker Route (Practice)
@bp.route('/practice/debug_checker', methods=['GET', 'POST'])
def practice_debug_checker():
    # Sample solution/hint for debug checker
    sample_solution = """# DEBUG: TEST - Check if input is valid\n# DEBUG: ISSUE - Input can be empty\n# DEBUG: FIX - Add input validation\ndef process(data):\n    if not data:\n        return None\n    # ...\n"""
    sample_hint = "Each DEBUG block should include TEST, ISSUE, and FIX."
    code = None
    debug_blocks = []
    already_checked = False
    filename = request.args.get('filename')
    uploaded_filename = None
    upload_status = None
    can_extract = False
    username = current_user.username if current_user.is_authenticated else None
    if request.method == 'POST':
        print(f"[DEBUG] POST received. form: {dict(request.form)}, files: {request.files.keys()}", flush=True)
        # Handle file upload only (no extraction yet)
        if 'file' in request.files and request.files['file'].filename:
            file = request.files['file']
            uploaded_filename = file.filename
            code = file.read().decode('utf-8')
            # Normalize line endings for uploaded files
            code = code.replace('\r\n', '\n').replace('\r', '\n')
            from app.models import DebugCheck
            if current_user.is_authenticated and uploaded_filename:
                if current_user.is_teacher():
                    can_extract = True
                    upload_status = f"File '{uploaded_filename}' uploaded by user '{username}'. Ready to extract."
                else:
                    existing = DebugCheck.query.filter_by(user_id=current_user.id, filename=uploaded_filename).first()
                    if existing:
                        already_checked = True
                        upload_status = f"User '{username}' has already uploaded/checked this file in the Debug Checker. Only one upload/check is allowed."
                    else:
                        can_extract = True
                        upload_status = f"File '{uploaded_filename}' uploaded by user '{username}'. Ready to extract."
            else:
                can_extract = True
                upload_status = f"File '{uploaded_filename}' uploaded by user '{username}'. Ready to extract."
            # Ensure code is always set in template context after upload
            # (so the hidden field in the extraction form is populated)
            # This is critical for extraction to work after upload
        # Handle extraction after upload
        elif 'extract_file' in request.form:
            uploaded_filename = request.form.get('uploaded_filename')
            code = request.form.get('uploaded_code')
            from app.models import DebugCheck
            from app import db
            if current_user.is_authenticated and uploaded_filename:
                if current_user.is_teacher():
                    # Always create a DebugCheck record for teachers on extraction attempt
                    existing = DebugCheck.query.filter_by(user_id=current_user.id, filename=uploaded_filename).first()
                    if not existing:
                        new_check = DebugCheck(user_id=current_user.id, filename=uploaded_filename)
                        db.session.add(new_check)
                        db.session.commit()
                    can_extract = True
                    upload_status = f"File '{uploaded_filename}' extracted for user '{username}'."
                else:
                    existing = DebugCheck.query.filter_by(user_id=current_user.id, filename=uploaded_filename).first()
                    if existing:
                        already_checked = True
                        upload_status = f"User '{username}' has already uploaded/checked this file in the Debug Checker. Only one upload/check is allowed."
                    else:
                        new_check = DebugCheck(user_id=current_user.id, filename=uploaded_filename)
                        db.session.add(new_check)
                        db.session.commit()
                        can_extract = True
                        upload_status = f"File '{uploaded_filename}' extracted and checked for user '{username}'."
            # Extract debug blocks
            if can_extract and code:
                print("[DEBUG] Code received for extraction (file upload):\n" + code, flush=True)
                debug_blocks = extract_debug_blocks(code)
                print(f"[DEBUG] Extracted debug blocks: {debug_blocks}", flush=True)
                # Store in session for debug checker view
                session['extracted_debug_blocks'] = debug_blocks
                # Also persist for lesson 2 view
                session['lesson2_debug_blocks'] = debug_blocks
                session['uploaded_filename'] = uploaded_filename
                # Redirect to anchor after extraction
                return redirect(url_for('main.practice_debug_checker') + '#extracted-debug-blocks')
        # Handle paste/submit as before
        else:
            code = request.form.get('code', '')
            if code:
                print("[DEBUG] Code received for extraction (paste box):\n" + code, flush=True)
                debug_blocks = extract_debug_blocks(code)
                print(f"[DEBUG] Extracted debug blocks: {debug_blocks}", flush=True)
                session['extracted_debug_blocks'] = debug_blocks
                session['lesson2_debug_blocks'] = debug_blocks
                session['uploaded_filename'] = uploaded_filename


    if already_checked:
        # Do not clear code for teachers, only for students who have already checked
        if not (current_user.is_authenticated and current_user.is_teacher()):
            code = None
            debug_blocks = []
            can_extract = False
    # If already checked, fetch comments and feedback from DB for display
    if already_checked:
        # Don't clear code/comments; fetch from DB
        comment_lines = []
        feedback_entries = []
        if current_user.is_authenticated and (uploaded_filename or filename):
            from app.models import CommentFeedback, Lesson
            template_path = "modules/module3/m3lesson1.html"
            lesson = Lesson.query.filter_by(template_path=template_path).first()
            if lesson:
                lesson_id = lesson.id
                file_to_check = uploaded_filename or filename or "unknown"
                feedback_entries = CommentFeedback.query.filter_by(user_id=current_user.id, lesson_id=lesson_id, filename=file_to_check).order_by(CommentFeedback.line_num).all()
                for entry in feedback_entries:
                    comment_lines.append((entry.line_num, entry.comment))
        can_extract = False

    # Only set debug_blocks from session if not just extracted (i.e., not POST with extraction)
    if request.method != 'POST' and 'extracted_debug_blocks' in session:
        debug_blocks = session['extracted_debug_blocks']

    # Add a message if no debug blocks are found after extraction (file or paste)
    debug_message = None
    # Only show the message if the user just tried to extract (not on upload or GET)
    if request.method == 'POST' and 'extract_file' in request.form and (not debug_blocks or len(debug_blocks) == 0):
        debug_message = "No DEBUG code blocks were found. You must include at least <b>three</b> DEBUG code blocks in your code to meet the requirement."

    # Gather checked files for this user (for sidebar grid)
    checked_files_grid = []
    if current_user.is_authenticated:
        from app.models import CommentCheck, DebugCheck
        comment_files = {c.filename for c in CommentCheck.query.filter_by(user_id=current_user.id).all()}
        # For teachers, always show all files they've checked (all DebugCheck records)
        if current_user.is_teacher():
            debug_files = {d.filename for d in DebugCheck.query.filter_by(user_id=current_user.id).all()}
        else:
            debug_files = {d.filename for d in DebugCheck.query.filter_by(user_id=current_user.id).all()}
        all_files = sorted(comment_files | debug_files)
        for fname in all_files:
            checked_files_grid.append({
                'filename': fname,
                'comment': '✔️' if fname in comment_files else '',
                'debug': '✔️' if fname in debug_files else ''
            })

    return render_template('main/practice_debug_checker.html', code=code, debug_blocks=debug_blocks, already_checked=already_checked, uploaded_filename=uploaded_filename, upload_status=upload_status, can_extract=can_extract, username=username, checked_files_grid=checked_files_grid, debug_message=debug_message, sample_solution=sample_solution, sample_hint=sample_hint)

# PDF download for extracted debug blocks and feedback
@bp.route('/download_debug_blocks_pdf', methods=['POST'])
@login_required
def download_debug_blocks_pdf():
    from flask import make_response
    code = request.form.get('code', '')
    if not code:
        code = session.get('uploaded_code', '')
    uploaded_filename = request.form.get('uploaded_filename', '').strip()
    if not uploaded_filename or uploaded_filename == 'None':
        uploaded_filename = session.get('uploaded_filename', 'Extracted_DebugBlocks')
    debug_blocks = session.get('extracted_debug_blocks', [])
    today_str = datetime.now().strftime('%Y-%m-%d')
    pdf_filename = f"{uploaded_filename}_debug_blocks_{today_str}.pdf"
    # Generate PDF
    buffer = io.BytesIO()
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import simpleSplit
    width, height = letter
    y = height - 40
    p = canvas.Canvas(buffer, pagesize=letter)
    p.setFont("Helvetica-Bold", 16)
    p.drawString(40, y, f"{uploaded_filename}")
    y -= 28
    p.setFont("Helvetica", 12)
    p.drawString(40, y, f"Date: {today_str}")
    y -= 30
    p.setFont("Helvetica-Bold", 13)
    p.drawString(40, y, "Lesson 2: Debug Checker - Extracted Debug Blocks")
    y -= 28
    p.setFont("Helvetica", 11)
    p.drawString(40, y, "Code:")
    y -= 18
    p.setFont("Courier", 9)
    if code.strip():
        for line in code.splitlines():
            if y < 60:
                p.showPage()
                y = height - 40
                p.setFont("Courier", 9)
            p.drawString(50, y, line)
            y -= 12
    else:
        p.drawString(50, y, "(No code provided)")
        y -= 12
    y -= 18
    p.setFont("Helvetica-Bold", 12)
    p.drawString(40, y, "Extracted Debug Blocks and Feedback:")
    y -= 18
    p.setFont("Helvetica", 10)
    if debug_blocks:
        for block in debug_blocks:
            if y < 60:
                p.showPage()
                y = height - 40
                p.setFont("Helvetica", 10)
            block_lines = simpleSplit(block, "Helvetica", 10, width - 100)
            for line in block_lines:
                p.drawString(50, y, line)
                y -= 12
            # Feedback logic (same as template)
            block_lower = block.lower()
            if '# debug:' in block_lower and ('test' not in block_lower and 'issue' not in block_lower and 'fix' not in block_lower):
                feedback = 'Add a test, issue, and fix description to your DEBUG block.'
            else:
                missing = []
                if 'test' not in block_lower:
                    missing.append('TEST')
                if 'issue' not in block_lower:
                    missing.append('ISSUE')
                if 'fix' not in block_lower:
                    missing.append('FIX')
                if not missing:
                    feedback = 'Great! Your DEBUG block is complete.'
                else:
                    feedback = f"Add a {', '.join(missing)} to your DEBUG block for full marks."
            p.setFont("Helvetica-Oblique", 9)
            p.setFillColorRGB(0.2,0.2,0.7)
            feedback_lines = simpleSplit(f"Feedback: {feedback}", "Helvetica-Oblique", 9, width - 120)
            for line in feedback_lines:
                p.drawString(70, y, line)
                y -= 12
            p.setFillColorRGB(0,0,0)
            y -= 10
    p.save()
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=pdf_filename, mimetype="application/pdf")

# Practice: Code Comments Extractor (copy/paste version)
@bp.route('/lesson1/download_feedback', methods=['POST'])
@login_required
def download_lesson1_feedback():
    from app.models import CommentFeedback
    from datetime import datetime
    from reportlab.lib.pagesizes import A4
    # Dynamically get lesson_id by template_path
    from app.models import Section
    template_path = "lessons/lesson3/l3section1.html"
    section = Section.query.filter_by(template_path=template_path).first()
    if not section:
        return "Section for comment checker not found.", 404
    section_id = section.id
    
    # Get filename from form
    filename = request.form.get('uploaded_filename', 'Comment_Feedback')
    
    # Extract comments from form data
    extracted_comments = []
    line_nums = request.form.getlist('line_num')
    comments = request.form.getlist('comment')
    feedbacks = request.form.getlist('feedback')
    
    # Build extracted_comments list from form data
    for line_num, comment, feedback in zip(line_nums, comments, feedbacks):
        try:
            line_num = int(line_num)
            extracted_comments.append((line_num, comment, feedback))
        except (ValueError, TypeError):
            pass
    
    # If no form data, fall back to database
    if not extracted_comments:
        feedback_entries = CommentFeedback.query.filter_by(
            user_id=current_user.id, 
            section_id=section_id,
            filename=filename
        ).order_by(CommentFeedback.line_num).all()
        if feedback_entries:
            extracted_comments = [(entry.line_num, entry.comment, entry.feedback) for entry in feedback_entries]
    
    if not extracted_comments:
        return "No extracted comments found for this lesson.", 404

    today = datetime.now().strftime('%Y-%m-%d')

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 50
    p.setFont("Helvetica-Bold", 16)
    p.drawString(50, y, f"{filename}")
    y -= 30
    p.setFont("Helvetica", 12)
    p.drawString(50, y, f"Date: {today}")
    y -= 30
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, y, "Lesson 1: Comment Checker - Feedback")
    y -= 40
    p.setFont("Helvetica", 12)
    from reportlab.lib.utils import simpleSplit
    max_width = width - 100
    for line_num, comment, feedback in extracted_comments:
        if y < 80:
            p.showPage()
            y = height - 50
            p.setFont("Helvetica", 12)
        # Word-wrap comment
        comment_lines = simpleSplit(f"Line {line_num}: {comment}", "Helvetica", 12, max_width)
        for line in comment_lines:
            p.drawString(50, y, line)
            y -= 16
        # Word-wrap feedback
        p.setFillColorRGB(0.2,0.2,0.7)
        feedback_lines = simpleSplit(f"Feedback: {feedback}", "Helvetica", 12, max_width - 20)
        for line in feedback_lines:
            p.drawString(70, y, line)
            y -= 16
        p.setFillColorRGB(0,0,0)
        y -= 10
    p.save()
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f"{filename}_feedback_{today}.pdf", mimetype="application/pdf")
@bp.route('/practice/code-comments', methods=['GET', 'POST'])
def practice_code_comments():
    # Sample solution/hint for code comments
    sample_solution = """# This is a sample comment\ndef add(a, b):\n    # Add two numbers and return the result\n    return a + b\n"""
    sample_hint = "Remember: Good comments explain why code exists, not just what it does."
    from flask import flash
    from app.models import CommentCheck, DebugCheck
    code = None
    comment_lines = []
    already_checked = False
    filename = request.args.get('filename')  # Pass filename as query param if needed
    uploaded_filename = None
    upload_status = None
    can_extract = False
    username = current_user.username if current_user.is_authenticated else None
    extracted_comments_for_session = []  # Always define at the start
    extracted_feedback_for_session = []
    feedback_entries = []
    checked_files_grid = []
    is_teacher = False
    feedback_dict = {}
    if request.method == 'POST':
        # Handle file upload only (no extraction yet)
        if 'file' in request.files and request.files['file'].filename:
            file = request.files['file']
            uploaded_filename = file.filename
            try:
                code = file.read().decode('utf-8')
            except (UnicodeDecodeError, AttributeError) as e:
                return f"Error reading file: {str(e)}", 400
            if current_user.is_authenticated and uploaded_filename:
                # Restrict only students to one check per file
                is_teacher = hasattr(current_user, 'is_teacher') and current_user.is_teacher()
                if not is_teacher:
                    existing = CommentCheck.query.filter_by(user_id=current_user.id, filename=uploaded_filename).first()
                    if existing:
                        already_checked = True
                        upload_status = f"User '{username}' has already uploaded/checked this file. Only one upload/check is allowed."
                    else:
                        from app import db
                        new_check = CommentCheck(user_id=current_user.id, filename=uploaded_filename)
                        db.session.add(new_check)
                        db.session.commit()
                        can_extract = True
                        upload_status = f"File '{uploaded_filename}' uploaded by user '{username}'. Ready to extract."
                else:
                    # Teachers can always check/upload
                    from app import db
                    new_check = CommentCheck(user_id=current_user.id, filename=uploaded_filename)
                    db.session.add(new_check)
                    db.session.commit()
                    can_extract = True
                    upload_status = f"File '{uploaded_filename}' uploaded by user '{username}'. Ready to extract."
            else:
                can_extract = True
                upload_status = f"File '{uploaded_filename}' uploaded by user '{username}'. Ready to extract."
            # Return immediately after file upload to show extract button
            # Build checked_files_grid before returning
            checked_files_grid = []
            is_teacher = False
            if current_user.is_authenticated:
                from app.models import CommentCheck as CommentCheckModel, DebugCheck
                is_teacher = hasattr(current_user, 'is_teacher') and current_user.is_teacher()
                comment_files = {c.filename for c in CommentCheckModel.query.filter_by(user_id=current_user.id).all()}
                debug_files = {d.filename for d in DebugCheck.query.filter_by(user_id=current_user.id).all()}
                all_files = sorted(comment_files | debug_files)
                for fname in all_files:
                    checked_files_grid.append({
                        'filename': fname,
                        'comment': '✔️' if fname in comment_files else '',
                        'debug': '✔️' if fname in debug_files else ''
                    })
            return render_template('main/practice_code_comments.html', code=code, comment_lines=[], already_checked=already_checked, uploaded_filename=uploaded_filename, upload_status=upload_status, can_extract=can_extract, username=username, checked_files_grid=checked_files_grid, is_teacher=is_teacher, feedback_dict={})
        # Handle extraction after upload
        elif 'extract_file' in request.form:
            uploaded_filename = request.form.get('uploaded_filename')
            code = request.form.get('uploaded_code')
            if current_user.is_authenticated and uploaded_filename:
                is_teacher = hasattr(current_user, 'is_teacher') and current_user.is_teacher()
                if not is_teacher:
                    existing = CommentCheck.query.filter_by(user_id=current_user.id, filename=uploaded_filename).first()
                    if existing:
                        already_checked = True
                        upload_status = f"User '{username}' has already uploaded/checked this file. Only one upload/check is allowed."
                    else:
                        from app import db
                        new_check = CommentCheck(user_id=current_user.id, filename=uploaded_filename)
                        db.session.add(new_check)
                        db.session.commit()
                        can_extract = True
                        upload_status = f"File '{uploaded_filename}' extracted and checked for user '{username}'."
                else:
                    from app import db
                    new_check = CommentCheck(user_id=current_user.id, filename=uploaded_filename)
                    db.session.add(new_check)
                    db.session.commit()
                can_extract = True
                upload_status = f"File '{uploaded_filename}' extracted for user '{username}'."
            # Extract all comments (lines starting with # or inline after code)
            if can_extract and code:
                from app import db
                from app.models import CommentFeedback, Section
                # Use the first Section with a template_path for the comment checker (or make this configurable)
                template_path = "lessons/lesson3/l3section1.html"
                section = Section.query.filter_by(template_path=template_path).first()
                if not section:
                    return "Section for comment checker not found.", 404
                section_id = section.id
                save_filename = uploaded_filename or filename or "unknown"
                extracted_comments_for_session.clear()
                # Compute code hash for deduplication
                code_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
                for idx, line in enumerate(code.splitlines(), start=1):
                    if '#' in line:
                        comment_index = line.find('#')
                        comment = line[comment_index:].strip()
                        if comment:
                            # Feedback logic
                            if 'http' in comment or 'www.' in comment:
                                feedback = "This comment appears to be a pasted URL. Comments should explain your code, not just link to resources."
                            elif 'print(' in comment:
                                feedback = "This comment is just a commented-out line of code. Good comments should explain why the code is there or what it does, not just repeat the code."
                            elif len(comment) < 15:
                                feedback = "This comment is too short or vague. Try to be more descriptive and explain the purpose of the code."
                            else:
                                feedback = "This comment is clear and descriptive. Well done!"
                            comment_lines.append((idx, comment))
                            extracted_comments_for_session.append((idx, comment, feedback))
                            extracted_feedback_for_session.append((idx, feedback))
                            # Save to DB
                            if current_user.is_authenticated:
                                exists = CommentFeedback.query.filter_by(user_id=current_user.id, section_id=section_id, filename=save_filename, line_num=idx).first()
                                if not exists:
                                    db.session.add(CommentFeedback(
                                        user_id=current_user.id,
                                        section_id=section_id,
                                        filename=save_filename,
                                        line_num=idx,
                                        comment=comment,
                                        feedback=feedback,
                                        code_hash=code_hash
                                    ))
                db.session.commit()
                # Always fetch feedback for this file from DB for display
                feedback_entries = CommentFeedback.query.filter_by(user_id=current_user.id, section_id=section_id, filename=save_filename).order_by(CommentFeedback.line_num).all()
                # Instead of redirecting, just show results on this page
        # Handle paste/submit as before
        else:
            code = request.form.get('code', '')
            # Extract all comments (lines starting with # or inline after code)
            if code:
                from app import db
                from app.models import CommentFeedback, Section
                template_path = "lessons/lesson3/l3section1.html"
                section = Section.query.filter_by(template_path=template_path).first()
                if not section:
                    return "Section for comment checker not found.", 404
                section_id = section.id
                save_filename = filename or "unknown"
                # Compute code hash for deduplication
                code_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
                for idx, line in enumerate(code.splitlines(), start=1):
                    if '#' in line:
                        comment_index = line.find('#')
                        comment = line[comment_index:].strip()
                        if comment:
                            # Feedback logic
                            if 'http' in comment or 'www.' in comment:
                                feedback = "This comment appears to be a pasted URL. Comments should explain your code, not just link to resources."
                            elif 'print(' in comment:
                                feedback = "This comment is just a commented-out line of code. Good comments should explain why the code is there or what it does, not just repeat the code."
                            elif len(comment) < 15:
                                feedback = "This comment is too short or vague. Try to be more descriptive and explain the purpose of the code."
                            else:
                                feedback = "This comment is clear and descriptive. Well done!"
                            comment_lines.append((idx, comment))
                            # Save to DB
                            if current_user.is_authenticated:
                                exists = CommentFeedback.query.filter_by(user_id=current_user.id, section_id=section_id, filename=save_filename, line_num=idx).first()
                                if not exists:
                                    db.session.add(CommentFeedback(
                                        user_id=current_user.id,
                                        section_id=section_id,
                                        filename=save_filename,
                                        line_num=idx,
                                        comment=comment,
                                        feedback=feedback,
                                        code_hash=code_hash
                                    ))
                db.session.commit()
                # Always fetch feedback for this file from DB for display
                feedback_entries = CommentFeedback.query.filter_by(user_id=current_user.id, section_id=section_id, filename=save_filename).order_by(CommentFeedback.line_num).all()
            # Restriction: Only allow one check per user per filename (on submit/paste)
            if current_user.is_authenticated and filename:
                is_teacher = hasattr(current_user, 'is_teacher') and current_user.is_teacher()
                if not is_teacher:
                    existing = CommentCheck.query.filter_by(user_id=current_user.id, filename=filename).first()
                    if existing:
                        already_checked = True
                        upload_status = f"User '{username}' has already checked this file. Only one check is allowed."
                    else:
                        from app import db
                        new_check = CommentCheck(user_id=current_user.id, filename=filename)
                        db.session.add(new_check)
                        db.session.commit()
                else:
                    from app import db
                    new_check = CommentCheck(user_id=current_user.id, filename=filename)
                    db.session.add(new_check)
                    db.session.commit()
            # If user clicked Extract Comments, show results on this page
            if 'extract_file' in request.form and not already_checked:
                extracted_comments_for_session = []
                for idx, comment in comment_lines:
                    feedback = ""
                    if 'http' in comment or 'www.' in comment:
                        feedback = "This comment appears to be a pasted URL. Comments should explain your code, not just link to resources."
                    elif 'print(' in comment:
                        feedback = "This comment is just a commented-out line of code. Good comments should explain why the code is there or what it does, not just repeat the code."
                    elif len(comment) < 15:
                        feedback = "This comment is too short or vague. Try to be more descriptive and explain the purpose of the code."
                    else:
                        feedback = "This comment is clear and descriptive. Well done!"
                    extracted_comments_for_session.append((idx, comment, feedback))
                session['extracted_comments'] = extracted_comments_for_session
                # Build feedback dict for template
                feedback_dict = {idx: feedback for idx, _, feedback in extracted_comments_for_session}
                return render_template('main/practice_code_comments.html', code=code, comment_lines=comment_lines, already_checked=already_checked, uploaded_filename=uploaded_filename, upload_status=upload_status, can_extract=can_extract, username=username, checked_files_grid=checked_files_grid, is_teacher=is_teacher, feedback_dict=feedback_dict)
    # If already checked, fetch comments and feedback from DB for display
    if already_checked:
        # Don't clear code/comments; fetch from DB
        comment_lines = []
        feedback_entries = []
        if current_user.is_authenticated and (uploaded_filename or filename):
            from app.models import CommentFeedback, Section
            template_path = "lessons/lesson3/l3section1.html"
            section = Section.query.filter_by(template_path=template_path).first()
            if section:
                section_id = section.id
                file_to_check = uploaded_filename or filename or "unknown"
                feedback_entries = CommentFeedback.query.filter_by(user_id=current_user.id, section_id=section_id, filename=file_to_check).order_by(CommentFeedback.line_num).all()
                for entry in feedback_entries:
                    comment_lines.append((entry.line_num, entry.comment))
        can_extract = False
    
    # Populate checked files grid and teacher status if not already set
    if not checked_files_grid:
        if current_user.is_authenticated:
            from app.models import CommentCheck, DebugCheck
            is_teacher = hasattr(current_user, 'is_teacher') and current_user.is_teacher()
            # Show both comment and debug checked files for both teachers and students
            comment_files = {c.filename for c in CommentCheck.query.filter_by(user_id=current_user.id).all()}
            debug_files = {d.filename for d in DebugCheck.query.filter_by(user_id=current_user.id).all()}
            all_files = sorted(comment_files | debug_files)
            for fname in all_files:
                checked_files_grid.append({
                    'filename': fname,
                    'comment': '✔️' if fname in comment_files else '',
                    'debug': '✔️' if fname in debug_files else ''
                })
    # Always fetch feedback for the current file for display
    if current_user.is_authenticated and (uploaded_filename or filename):
        from app.models import CommentFeedback, Section
        template_path = "lessons/lesson3/l3section1.html"
        section = Section.query.filter_by(template_path=template_path).first()
        if section:
            section_id = section.id
            file_to_check = uploaded_filename or filename or "unknown"
            feedback_entries = CommentFeedback.query.filter_by(user_id=current_user.id, section_id=section_id, filename=file_to_check).order_by(CommentFeedback.line_num).all()
    # Build a feedback dict for template: line_num -> feedback
    feedback_dict = {entry.line_num: entry.feedback for entry in feedback_entries} if feedback_entries else {}
    return render_template('main/practice_code_comments.html', code=code, comment_lines=comment_lines, already_checked=already_checked, uploaded_filename=uploaded_filename, upload_status=upload_status, can_extract=can_extract, username=username, checked_files_grid=checked_files_grid, is_teacher=is_teacher, feedback_dict=feedback_dict, sample_solution=sample_solution, sample_hint=sample_hint)

@bp.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    return redirect(url_for('main.home'))

@bp.route('/home')
def home():
    return render_template('home.html')

@bp.route('/api/home-data')
def api_home_data():
    """Public JSON endpoint for the JavaScript-driven homepage."""
    # All active courses
    courses = Course.query.filter_by(is_active=True).order_by(Course.order, Course.created_at.desc()).all()

    # Featured courses: most recently updated (up to 6)
    featured = courses[:6]

    def course_dict(c):
        lesson_count = len(c.lessons)
        # Derive a simple category tag from the title
        title_lower = c.title.lower()
        if 'python' in title_lower:
            tag = 'Python'
        elif 'debug' in title_lower:
            tag = 'Debugging'
        elif 'comment' in title_lower or 'document' in title_lower:
            tag = 'Documentation'
        elif 'web' in title_lower or 'html' in title_lower:
            tag = 'Web'
        elif 'algorithm' in title_lower or 'logic' in title_lower:
            tag = 'Algorithms'
        else:
            tag = 'Programming'
        return {
            'id': c.id,
            'title': c.title,
            'description': c.description or '',
            'lesson_count': lesson_count,
            'tag': tag,
            'created_at': c.created_at.strftime('%d %b %Y') if c.created_at else '',
        }

    # All lessons with their course names for the library grid
    all_lessons = Lesson.query.join(Course).filter(Course.is_active == True).order_by(Lesson.order, Lesson.id).all()

    def lesson_dict(l):
        section_count = len(l.sections) if hasattr(l, 'sections') else 0
        return {
            'id': l.id,
            'title': l.title,
            'description': l.description or '',
            'course_id': l.course_id,
            'course_title': l.course.title if l.course else '',
            'section_count': section_count,
            'video': bool(l.video_url),
        }

    return jsonify({
        'featured_courses': [course_dict(c) for c in featured],
        'all_courses': [course_dict(c) for c in courses],
        'lessons': [lesson_dict(l) for l in all_lessons],
        'total_courses': len(courses),
        'total_lessons': len(all_lessons),
    })

@bp.route('/dashboard')
@login_required
def dashboard():
    if current_user.is_teacher():
        # Use the admin/teacher_dashboard.html layout for teacher dashboard
        teacher_courses = Course.query.filter_by(teacher_id=current_user.id).all()
        # Collect all students enrolled in teacher's courses
        student_ids = set()
        for course in teacher_courses:
            for enrollment in course.enrollments:
                student_ids.add(enrollment.student_id)
        students = User.query.filter(User.id.in_(student_ids)).all() if student_ids else []
        # Get recent submissions from teacher's courses
        recent_submissions = db.session.query(Submission).join(
            Submission.assignment
        ).filter(
            Submission.assignment.has(Assignment.course_id.in_([c.id for c in teacher_courses]))
        ).order_by(Submission.submitted_at.desc()).limit(10).all()
        total_students = len(students)
        total_enrollments = sum(len(course.enrollments) for course in teacher_courses)
        return render_template('admin/teacher_dashboard.html',
            teacher_courses=teacher_courses,
            students=students,
            recent_submissions=recent_submissions,
            total_students=total_students,
            total_enrollments=total_enrollments
        )
    else:
        # Student dashboard
        enrollments = Enrollment.query.filter_by(student_id=current_user.id).all()
        # Get pending assignments
        pending_assignments = []
        for enrollment in enrollments:
            assignments = Assignment.query.filter_by(course_id=enrollment.course_id).all()
            for assignment in assignments:
                submission = Submission.query.filter_by(
                    assignment_id=assignment.id, 
                    student_id=current_user.id
                ).first()
                if not submission:
                    pending_assignments.append(assignment)
        return render_template('dashboard/student_dashboard_page.html',
            preview_user=current_user,
            preview_enrollments=enrollments,
            preview_pending_assignments=pending_assignments[:5]
        )

# Standalone student dashboard route for macro-based rendering
@bp.route('/student_dashboard')
@login_required
def student_dashboard():
    enrollments = Enrollment.query.filter_by(student_id=current_user.id).all()
    pending_assignments = []
    for enrollment in enrollments:
        assignments = Assignment.query.filter_by(course_id=enrollment.course_id).all()
        for assignment in assignments:
            submission = Submission.query.filter_by(
                assignment_id=assignment.id, 
                student_id=current_user.id
            ).first()
            if not submission:
                pending_assignments.append(assignment)
    return render_template('dashboard/student_dashboard_page.html',
        preview_user=current_user,
        preview_enrollments=enrollments,
        preview_pending_assignments=pending_assignments[:5]
    )

from flask import redirect, url_for
from app import db
from werkzeug.security import check_password_hash, generate_password_hash

@bp.route('/profile')
@login_required
def profile():
    """User profile page showing account info and activity"""
    try:
        # Get enrollments safely
        enrollments = Enrollment.query.filter_by(student_id=current_user.id).all() or []
        
        # Calculate stats safely
        total_courses = len(enrollments) if enrollments else 0
        completed_courses = sum(1 for e in enrollments if e and hasattr(e, 'completed') and e.completed) if enrollments else 0
        
        # Get recent submissions safely
        recent_submissions = Submission.query.filter_by(
            student_id=current_user.id
        ).order_by(Submission.submitted_at.desc()).limit(5).all() or []
        
        return render_template('auth/profile.html',
            enrollments=enrollments,
            total_courses=total_courses,
            completed_courses=completed_courses,
            recent_submissions=recent_submissions
        )
    except Exception as e:
        # Log the error for debugging
        import sys
        print(f"Profile page error: {str(e)}", file=sys.stderr)
        flash('An error occurred loading your profile. Please try again.', 'danger')
        return redirect(url_for('main.dashboard'))

@bp.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    """User settings page for password and preferences"""
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'change_password':
            current_password = request.form.get('current_password')
            new_password = request.form.get('new_password')
            confirm_password = request.form.get('confirm_password')
            
            # Validate current password
            if not current_user.check_password(current_password):
                flash('Current password is incorrect.', 'error')
            elif len(new_password) < 6:
                flash('New password must be at least 6 characters long.', 'error')
            elif new_password != confirm_password:
                flash('New passwords do not match.', 'error')
            else:
                current_user.set_password(new_password)
                db.session.commit()
                flash('Password changed successfully!', 'success')
                return redirect(url_for('main.settings'))
        
        elif action == 'update_preferences':
            # Store preferences in user model or preferences table
            # For now, we'll just show success
            flash('Preferences updated successfully!', 'success')
            return redirect(url_for('main.settings'))
    
    return render_template('auth/settings.html')

@bp.route('/search')
@login_required
def search():
    """Advanced search with filters, sorting, and history"""
    from sqlalchemy import or_, and_
    
    query = request.args.get('q', '').strip()
    search_type = request.args.get('type', 'all')  # all, courses, lessons, assignments
    sort_by = request.args.get('sort', 'relevance')  # relevance, title, created, difficulty
    difficulty = request.args.get('difficulty', '')  # beginner, intermediate, advanced
    instructor = request.args.get('instructor', '')  # Filter by instructor
    
    results = {
        'courses': [],
        'lessons': [],
        'assignments': [],
        'total': 0
    }
    
    search_history = []
    
    # Get search history from session (limit to 10)
    if 'search_history' not in session:
        session['search_history'] = []
    
    # Add current query to history if valid
    if query and len(query) >= 2:
        if query not in session['search_history']:
            session['search_history'].insert(0, query)
            session['search_history'] = session['search_history'][:10]
            session.modified = True
    
    search_history = session.get('search_history', [])
    
    if query and len(query) >= 2:
        max_results_per_type = 50
        # Build search conditions
        search_condition = or_(
            Course.title.ilike(f'%{query}%'),
            Course.description.ilike(f'%{query}%')
        )
        
        # Search courses
        if search_type in ['all', 'courses']:
            courses_query = Course.query.filter(search_condition)
            
            # Apply difficulty filter
            if difficulty:
                courses_query = courses_query.filter_by(difficulty=difficulty)
            
            # Apply instructor filter
            if instructor:
                courses_query = courses_query.join(User).filter(User.username.ilike(f'%{instructor}%'))
            
            # Apply sorting
            if sort_by == 'title':
                courses_query = courses_query.order_by(Course.title.asc())
            elif sort_by == 'created':
                courses_query = courses_query.order_by(Course.created_at.desc())
            elif sort_by == 'difficulty':
                courses_query = courses_query.order_by(Course.difficulty.asc())
            else:  # relevance
                courses_query = courses_query.order_by(Course.title.asc())
            
            results['courses'] = courses_query.limit(max_results_per_type).all()
        
        # Search lessons
        if search_type in ['all', 'lessons']:
            lessons_query = Lesson.query.filter(
                or_(
                    Lesson.title.ilike(f'%{query}%'),
                    Lesson.content.ilike(f'%{query}%')
                )
            )
            
            # Apply difficulty filter
            if difficulty:
                lessons_query = lessons_query.join(Course).filter(Course.difficulty == difficulty)
            
            # Apply sorting
            if sort_by == 'title':
                lessons_query = lessons_query.order_by(Lesson.title.asc())
            elif sort_by == 'created':
                lessons_query = lessons_query.order_by(Lesson.created_at.desc())
            else:  # relevance
                lessons_query = lessons_query.order_by(Lesson.title.asc())
            lessons_query = lessons_query.options(
                load_only(Lesson.id, Lesson.course_id, Lesson.title, Lesson.description, Lesson.created_at)
            )
            
            results['lessons'] = lessons_query.limit(max_results_per_type).all()
        
        # Search assignments
        if search_type in ['all', 'assignments']:
            assignments_query = Assignment.query.filter(
                or_(
                    Assignment.title.ilike(f'%{query}%'),
                    Assignment.description.ilike(f'%{query}%')
                )
            )
            
            # Apply sorting
            if sort_by == 'title':
                assignments_query = assignments_query.order_by(Assignment.title.asc())
            elif sort_by == 'created':
                assignments_query = assignments_query.order_by(Assignment.created_at.desc())
            else:  # relevance
                assignments_query = assignments_query.order_by(Assignment.title.asc())
            
            results['assignments'] = assignments_query.limit(max_results_per_type).all()
        
        results['total'] = len(results['courses']) + len(results['lessons']) + len(results['assignments'])
    
    # Get unique instructors for filter dropdown
    instructors = db.session.query(User.username).join(Course).filter(
        User.is_teacher == True
    ).distinct().all()
    instructors = [inst[0] for inst in instructors]
    
    return render_template('main/advanced_search.html',
                         query=query,
                         results=results,
                         search_type=search_type,
                         sort_by=sort_by,
                         difficulty=difficulty,
                         instructor=instructor,
                         search_history=search_history,
                         instructors=instructors)


@bp.route('/progress')
@login_required
def student_progress():
    """Student progress dashboard with completion stats and charts"""
    if current_user.is_teacher():
        flash('Students only feature.', 'warning')
        return redirect(url_for('main.dashboard'))
    
    # Get all enrolled courses
    enrollments = Enrollment.query.filter_by(student_id=current_user.id).all()
    
    progress_data = []
    total_lessons = 0
    total_completed = 0
    total_assignments = 0
    total_submitted = 0
    total_quizzes = 0
    total_quiz_attempts = 0
    
    for enrollment in enrollments:
        course = enrollment.course
        
        # Count lessons
        lessons = Lesson.query.filter_by(course_id=course.id).all()
        lesson_count = len(lessons)
        total_lessons += lesson_count
        
        # Count completed lessons (has submission or quiz attempt)
        completed_lessons = 0
        for lesson in lessons:
            has_submission = Submission.query.filter(
                Submission.user_id == current_user.id,
                Submission.assignment_id.in_(
                    db.session.query(Assignment.id).filter_by(lesson_id=lesson.id)
                )
            ).first()
            
            has_quiz = QuizAttempt.query.filter(
                QuizAttempt.user_id == current_user.id,
                QuizAttempt.quiz_id.in_(
                    db.session.query(Quiz.id).filter_by(lesson_id=lesson.id)
                )
            ).first()
            
            if has_submission or has_quiz:
                completed_lessons += 1
        
        total_completed += completed_lessons
        
        # Count assignments and submissions
        assignments = Assignment.query.filter(
            Assignment.lesson_id.in_(db.session.query(Lesson.id).filter_by(course_id=course.id))
        ).all()
        assignment_count = len(assignments)
        total_assignments += assignment_count
        
        submitted_count = Submission.query.filter(
            Submission.user_id == current_user.id,
            Submission.assignment_id.in_(
                db.session.query(Assignment.id).filter(
                    Assignment.lesson_id.in_(db.session.query(Lesson.id).filter_by(course_id=course.id))
                )
            )
        ).count()
        total_submitted += submitted_count
        
        # Count quizzes and attempts
        quizzes = Quiz.query.filter(
            Quiz.lesson_id.in_(db.session.query(Lesson.id).filter_by(course_id=course.id))
        ).all()
        quiz_count = len(quizzes)
        total_quizzes += quiz_count
        
        quiz_attempts = QuizAttempt.query.filter(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.quiz_id.in_(
                db.session.query(Quiz.id).filter(
                    Quiz.lesson_id.in_(db.session.query(Lesson.id).filter_by(course_id=course.id))
                )
            )
        ).count()
        total_quiz_attempts += quiz_attempts
        
        # Calculate percentages
        lesson_progress = (completed_lessons / lesson_count * 100) if lesson_count > 0 else 0
        assignment_progress = (submitted_count / assignment_count * 100) if assignment_count > 0 else 0
        quiz_progress = (quiz_attempts / quiz_count * 100) if quiz_count > 0 else 0
        
        # Overall course progress
        total_items = lesson_count + assignment_count + quiz_count
        completed_items = completed_lessons + submitted_count + quiz_attempts
        overall_progress = (completed_items / total_items * 100) if total_items > 0 else 0
        
        progress_data.append({
            'course': course,
            'lessons': {
                'total': lesson_count,
                'completed': completed_lessons,
                'progress': round(lesson_progress, 1)
            },
            'assignments': {
                'total': assignment_count,
                'submitted': submitted_count,
                'progress': round(assignment_progress, 1)
            },
            'quizzes': {
                'total': quiz_count,
                'attempts': quiz_attempts,
                'progress': round(quiz_progress, 1)
            },
            'overall_progress': round(overall_progress, 1)
        })
    
    # Calculate overall statistics
    overall_stats = {
        'lessons': {
            'total': total_lessons,
            'completed': total_completed,
            'progress': (total_completed / total_lessons * 100) if total_lessons > 0 else 0
        },
        'assignments': {
            'total': total_assignments,
            'submitted': total_submitted,
            'progress': (total_submitted / total_assignments * 100) if total_assignments > 0 else 0
        },
        'quizzes': {
            'total': total_quizzes,
            'attempts': total_quiz_attempts,
            'progress': (total_quiz_attempts / total_quizzes * 100) if total_quizzes > 0 else 0
        }
    }
    
    return render_template('dashboard/student_progress.html', 
                         progress_data=progress_data,
                         overall_stats=overall_stats)
