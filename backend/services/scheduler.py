import asyncio
import base64
import logging
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import select

from backend.config import settings
from backend.models.database import async_session
from backend.models.tables import ScheduledReportDB, ReportExportDB
from backend.api.reports import build_compliance_report, _render_pdf, _next_run_for

logger = logging.getLogger("certacito.scheduler")

# how often the loop wakes up and checks for due reports. polling interval for due reports
CHECK_INTERVAL_SECONDS = 300


def _smtp_configured() -> bool:
    # only send if all the smtp bits are set, otherwise we just skip the email
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password and settings.smtp_from)


def _send_email(recipient: str, pdf_bytes: bytes, report_name: str) -> None:
    msg = MIMEMultipart()
    msg["Subject"] = f"Certacito.ai - {report_name}"
    msg["From"] = settings.smtp_from
    msg["To"] = recipient
    msg.attach(MIMEText("Attached: your scheduled Certacito.ai compliance report.", "plain"))
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename="compliance_report.pdf")
    msg.attach(attachment)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def _run_due_schedules() -> None:
    async with async_session() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(ScheduledReportDB)
            .where(ScheduledReportDB.status == "Active")
            .where(ScheduledReportDB.next_run <= now)
        )
        due = result.scalars().all()
        if not due:
            return

        for schedule in due:
            try:
                # build the report, render it to pdf, stash an export row
                data = await build_compliance_report(db, days=30)
                pdf_bytes = _render_pdf(data)

                export = ReportExportDB(
                    id=str(uuid.uuid4()),
                    name="Regulatory Compliance Summary (scheduled)",
                    generated_by=f"schedule:{schedule.id}",
                    format="PDF",
                    size_bytes=len(pdf_bytes),
                    content=base64.b64encode(pdf_bytes).decode(),
                )
                db.add(export)

                # only email it out if smtp is actually configured
                if _smtp_configured():
                    _send_email(schedule.recipient, pdf_bytes, export.name)
                else:
                    logger.info(
                        "scheduled report %s generated but not emailed - no SMTP configured (SMTP_HOST/USER/PASSWORD/FROM)",
                        schedule.id,
                    )

                schedule.last_sent = now
                schedule.next_run = _next_run_for(schedule.frequency, now)
                await db.commit()
                # print("[scheduler] sent report", schedule.id, "->", schedule.recipient)
            except Exception:
                # something blew up for this one, log it and move on. will retry
                # next cycle since next_run wasn't bumped. TODO about
                # a proper retry/backoff but this is fine for now
                logger.exception("scheduled report %s failed, will retry next cycle", schedule.id)
                await db.rollback()


async def scheduler_loop() -> None:
    # runs for the life of the process, checking every few mins for due reports
    while True:
        try:
            await _run_due_schedules()
        except Exception:
            logger.exception("scheduler tick failed")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
