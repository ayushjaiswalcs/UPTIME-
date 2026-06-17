"""
PDF report generator using ReportLab.

Colour scheme:
  Dark header  #1e293b
  Primary blue #4f46e5
  Green        #16a34a  (good / above SLA)
  Red          #dc2626  (bad / below SLA)
  Light bg     #f8fafc
"""
import io
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ── Brand colours ──────────────────────────────────────────────────────────────
C_DARK = colors.HexColor("#1e293b")
C_BLUE = colors.HexColor("#4f46e5")
C_GREEN = colors.HexColor("#16a34a")
C_RED = colors.HexColor("#dc2626")
C_LIGHT = colors.HexColor("#f8fafc")
C_BORDER = colors.HexColor("#e2e8f0")
C_ALT = colors.HexColor("#f1f5f9")
C_WHITE = colors.white


# ── Page callbacks (header / footer) ──────────────────────────────────────────
def _make_page_template(doc):
    """Return a PageTemplate with a header bar and page-number footer."""

    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="main",
    )

    def on_page(canvas, doc):
        canvas.saveState()
        # Header bar
        canvas.setFillColor(C_DARK)
        canvas.rect(0, A4[1] - 14 * mm, A4[0], 14 * mm, fill=1, stroke=0)
        canvas.setFillColor(C_WHITE)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(15 * mm, A4[1] - 9 * mm, "UPTIME")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(A4[0] - 15 * mm, A4[1] - 9 * mm, "Uptime Monitoring Platform")

        # Footer
        canvas.setFillColor(C_DARK)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(15 * mm, 7 * mm, f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
        canvas.drawRightString(
            A4[0] - 15 * mm, 7 * mm, f"Page {doc.page}"
        )
        canvas.restoreState()

    return PageTemplate(id="main", frames=[frame], onPage=on_page)


def _base_doc(buffer):
    """Create a BaseDocTemplate with our page template."""
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
    )
    doc.addPageTemplates([_make_page_template(doc)])
    return doc


# ── Shared styles ──────────────────────────────────────────────────────────────
_base_styles = getSampleStyleSheet()

STYLE_H1 = ParagraphStyle(
    "H1",
    parent=_base_styles["Heading1"],
    fontSize=22,
    textColor=C_DARK,
    spaceAfter=4,
    spaceBefore=6,
    alignment=TA_CENTER,
)
STYLE_H2 = ParagraphStyle(
    "H2",
    parent=_base_styles["Heading2"],
    fontSize=14,
    textColor=C_BLUE,
    spaceAfter=4,
    spaceBefore=10,
)
STYLE_BODY = ParagraphStyle(
    "Body",
    parent=_base_styles["Normal"],
    fontSize=9,
    textColor=C_DARK,
    spaceAfter=2,
)
STYLE_CENTER = ParagraphStyle(
    "Center",
    parent=STYLE_BODY,
    alignment=TA_CENTER,
)
STYLE_SMALL = ParagraphStyle(
    "Small",
    parent=STYLE_BODY,
    fontSize=8,
    textColor=colors.HexColor("#64748b"),
)
STYLE_COVER_TITLE = ParagraphStyle(
    "CoverTitle",
    parent=_base_styles["Title"],
    fontSize=28,
    textColor=C_WHITE,
    alignment=TA_CENTER,
    spaceAfter=8,
)
STYLE_COVER_SUB = ParagraphStyle(
    "CoverSub",
    parent=_base_styles["Normal"],
    fontSize=12,
    textColor=colors.HexColor("#cbd5e1"),
    alignment=TA_CENTER,
)


def _header_table_style(num_cols: int) -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), C_DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_ALT]),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TEXTCOLOR", (0, 1), (-1, -1), C_DARK),
            ("GRID", (0, 0), (-1, -1), 0.25, C_BORDER),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
    )


def _cover_page(org_name: str, report_title: str, period: str) -> list:
    """Return story elements for a full-page cover."""
    elements = []
    # Dark cover background block — drawn as a coloured table
    cover_data = [
        [Paragraph(org_name, STYLE_COVER_SUB)],
        [Paragraph(report_title, STYLE_COVER_TITLE)],
        [Paragraph(period, STYLE_COVER_SUB)],
        [Spacer(1, 6)],
        [Paragraph(f"Generated {datetime.utcnow().strftime('%B %d, %Y')}", STYLE_COVER_SUB)],
    ]
    cover_table = Table(cover_data, colWidths=[180 * mm])
    cover_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), C_DARK),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    elements.append(Spacer(1, 50 * mm))
    elements.append(cover_table)
    elements.append(PageBreak())
    return elements


# ── PDFGenerator ──────────────────────────────────────────────────────────────
class PDFGenerator:
    """Generates branded PDF reports as bytes."""

    # ── Uptime report ──────────────────────────────────────────────────────
    def generate_uptime_report(
        self,
        org: Any,
        monitors_data: list[dict],
        period: str,
    ) -> bytes:
        buffer = io.BytesIO()
        doc = _base_doc(buffer)
        story = []

        org_name = getattr(org, "name", str(org)) if org else "All Monitors"

        story += _cover_page(org_name, "Uptime Report", period)

        story.append(Paragraph("Executive Summary", STYLE_H2))

        # Summary stats
        total = len(monitors_data)
        sla_ok = sum(1 for m in monitors_data if m.get("sla_achieved", False))
        avg_up = (
            sum(m.get("uptime_pct", 0) for m in monitors_data) / total if total else 0
        )
        avg_rt = (
            sum(m.get("avg_response_time", 0) for m in monitors_data) / total if total else 0
        )

        summary_data = [
            ["Metric", "Value"],
            ["Total Monitors", str(total)],
            ["Monitors Meeting SLA (≥99.9%)", str(sla_ok)],
            ["Average Uptime", f"{avg_up:.2f}%"],
            ["Average Response Time", f"{avg_rt:.0f} ms"],
            ["Report Period", period],
        ]
        summary_table = Table(summary_data, colWidths=[90 * mm, 90 * mm])
        summary_table.setStyle(_header_table_style(2))
        story.append(summary_table)
        story.append(Spacer(1, 6 * mm))

        # Detailed data table
        story.append(Paragraph("Monitor Details", STYLE_H2))

        if monitors_data:
            col_headers = [
                "Monitor Name",
                "URL",
                "Uptime %",
                "Downtime %",
                "Avg RT (ms)",
                "Checks",
                "Down",
                "SLA",
            ]
            rows = [col_headers]
            for m in monitors_data:
                sla_text = "YES" if m.get("sla_achieved") else "NO"
                rows.append(
                    [
                        Paragraph(str(m.get("name", ""))[:40], STYLE_SMALL),
                        Paragraph(str(m.get("url", ""))[:45], STYLE_SMALL),
                        f"{m.get('uptime_pct', 0):.2f}%",
                        f"{m.get('downtime_pct', 0):.2f}%",
                        f"{m.get('avg_response_time', 0):.0f}",
                        str(m.get("total_checks", 0)),
                        str(m.get("down_checks", 0)),
                        sla_text,
                    ]
                )
            col_widths = [42 * mm, 42 * mm, 18 * mm, 18 * mm, 18 * mm, 14 * mm, 12 * mm, 12 * mm]
            detail_table = Table(rows, colWidths=col_widths)
            ts = _header_table_style(len(col_headers))
            # Colour the SLA column
            for i, m in enumerate(monitors_data, start=1):
                colour = C_GREEN if m.get("sla_achieved") else C_RED
                ts.add("TEXTCOLOR", (7, i), (7, i), colour)
                ts.add("FONTNAME", (7, i), (7, i), "Helvetica-Bold")
            detail_table.setStyle(ts)
            story.append(detail_table)
        else:
            story.append(Paragraph("No monitor data available for this period.", STYLE_BODY))

        doc.build(story)
        return buffer.getvalue()

    # ── Incident report ────────────────────────────────────────────────────
    def generate_incident_report(
        self,
        org: Any,
        incidents_data: dict,
        period: str,
    ) -> bytes:
        buffer = io.BytesIO()
        doc = _base_doc(buffer)
        story = []

        org_name = getattr(org, "name", str(org)) if org else "All Monitors"

        story += _cover_page(org_name, "Incident Report", period)

        story.append(Paragraph("Incident Summary", STYLE_H2))

        summary_data = [
            ["Metric", "Value"],
            ["Total Incidents", str(incidents_data.get("total_incidents", 0))],
            ["Resolved", str(incidents_data.get("resolved", 0))],
            ["Ongoing", str(incidents_data.get("ongoing", 0))],
            [
                "Avg Resolution Time",
                f"{incidents_data.get('avg_resolution_mins', 0):.1f} mins",
            ],
            ["Report Period", period],
        ]
        summary_table = Table(summary_data, colWidths=[90 * mm, 90 * mm])
        summary_table.setStyle(_header_table_style(2))
        story.append(summary_table)
        story.append(Spacer(1, 6 * mm))

        incidents = incidents_data.get("incidents", [])
        story.append(Paragraph(f"Incident Log ({len(incidents)} incidents)", STYLE_H2))

        if incidents:
            col_headers = [
                "ID",
                "Monitor",
                "Started At",
                "Resolved At",
                "Duration (min)",
                "Status",
                "Error",
            ]
            rows = [col_headers]
            for inc in incidents:
                rows.append(
                    [
                        str(inc.get("id", "")),
                        Paragraph(str(inc.get("monitor_name", ""))[:35], STYLE_SMALL),
                        str(inc.get("started_at", ""))[:19],
                        str(inc.get("resolved_at", "") or "Ongoing")[:19],
                        str(inc.get("duration_mins", "")),
                        str(inc.get("status", "")),
                        Paragraph(str(inc.get("error", "") or "")[:60], STYLE_SMALL),
                    ]
                )
            col_widths = [10 * mm, 38 * mm, 30 * mm, 30 * mm, 20 * mm, 18 * mm, 34 * mm]
            inc_table = Table(rows, colWidths=col_widths)
            ts = _header_table_style(len(col_headers))
            for i, inc in enumerate(incidents, start=1):
                colour = C_GREEN if inc.get("status") == "resolved" else C_RED
                ts.add("TEXTCOLOR", (5, i), (5, i), colour)
                ts.add("FONTNAME", (5, i), (5, i), "Helvetica-Bold")
            inc_table.setStyle(ts)
            story.append(inc_table)
        else:
            story.append(Paragraph("No incidents recorded for this period.", STYLE_BODY))

        doc.build(story)
        return buffer.getvalue()

    # ── Summary report ─────────────────────────────────────────────────────
    def generate_summary_report(
        self,
        org: Any,
        summary_data: dict,
        period: str,
    ) -> bytes:
        buffer = io.BytesIO()
        doc = _base_doc(buffer)
        story = []

        org_name = getattr(org, "name", str(org)) if org else "All Monitors"

        story += _cover_page(org_name, "Executive Summary Report", period)

        story.append(Paragraph("Executive Summary", STYLE_H2))

        kpi_data = [
            ["KPI", "Value"],
            ["Organisation", str(summary_data.get("org_name", org_name))],
            ["Period", str(summary_data.get("period", period))],
            ["Total Monitors", str(summary_data.get("total_monitors", 0))],
            ["Average Uptime", f"{summary_data.get('avg_uptime', 0):.2f}%"],
            [
                "SLA Compliance",
                f"{summary_data.get('sla_compliance_pct', 0):.1f}%",
            ],
            ["Total Incidents", str(summary_data.get("total_incidents", 0))],
            [
                "Avg Response Time",
                f"{summary_data.get('avg_response_time', 0):.0f} ms",
            ],
        ]
        kpi_table = Table(kpi_data, colWidths=[90 * mm, 90 * mm])
        kpi_table.setStyle(_header_table_style(2))
        story.append(kpi_table)
        story.append(Spacer(1, 6 * mm))

        best = summary_data.get("best_monitor")
        worst = summary_data.get("worst_monitor")
        if best or worst:
            story.append(Paragraph("Top & Bottom Performers", STYLE_H2))
            perf_data = [["", "Monitor Name", "Uptime %"]]
            if best:
                perf_data.append(
                    ["Best", str(best.get("name", "")), f"{best.get('uptime', 0):.2f}%"]
                )
            if worst:
                perf_data.append(
                    ["Worst", str(worst.get("name", "")), f"{worst.get('uptime', 0):.2f}%"]
                )
            perf_table = Table(perf_data, colWidths=[30 * mm, 100 * mm, 50 * mm])
            ts = _header_table_style(3)
            if best and len(perf_data) > 1:
                ts.add("TEXTCOLOR", (2, 1), (2, 1), C_GREEN)
                ts.add("FONTNAME", (2, 1), (2, 1), "Helvetica-Bold")
            if worst:
                last = len(perf_data) - 1
                ts.add("TEXTCOLOR", (2, last), (2, last), C_RED)
                ts.add("FONTNAME", (2, last), (2, last), "Helvetica-Bold")
            perf_table.setStyle(ts)
            story.append(perf_table)
            story.append(Spacer(1, 6 * mm))

        recommendations = summary_data.get("recommendations", [])
        if recommendations:
            story.append(Paragraph("Recommendations", STYLE_H2))
            for rec in recommendations:
                story.append(Paragraph(f"• {rec}", STYLE_BODY))
            story.append(Spacer(1, 4 * mm))

        doc.build(story)
        return buffer.getvalue()
