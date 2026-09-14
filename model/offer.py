"""Who can afford to pay you $10,000 a month?

The plan says sell meetings. This answers the question that actually decides
whether anyone buys: *whose* meetings are worth that much.

A meeting is not worth a flat amount. It is worth whatever it is worth to the
company receiving it, which is a function of their deal size and how often they
close. That single number sorts the entire market into companies you can sell to
and companies you cannot, and it is the difference between a hard year and an
easy one.

Nothing here is a forecast. It is a filter for building your list.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class Buyer:
    """A prospective client, described by the only things that matter."""

    name: str
    acv: float                    # annual contract value of one closed deal
    meeting_to_opp: float = 0.50  # meetings that become real opportunities
    opp_to_won: float = 0.25      # opportunities that close

    def __post_init__(self) -> None:
        for v, n in ((self.meeting_to_opp, "meeting_to_opp"), (self.opp_to_won, "opp_to_won")):
            if not 0.0 <= v <= 1.0:
                raise ValueError(f"{n} must be a rate in [0, 1], got {v!r}")
        if self.acv <= 0:
            raise ValueError("acv must be > 0")

    @property
    def meeting_value(self) -> float:
        """Expected first-year revenue created by one qualified meeting."""
        return self.acv * self.meeting_to_opp * self.opp_to_won


def roi(buyer: Buyer, retainer: float, meetings_per_month: float) -> float:
    """Return on the retainer, in pipeline dollars per dollar spent.

    Below 3x this is a negotiation. Above 5x it stops being a price
    conversation and becomes an availability one, which is the only kind of
    sales conversation worth having when you have no case studies yet.
    """
    if retainer <= 0:
        raise ValueError("retainer must be > 0")
    return (meetings_per_month * buyer.meeting_value) / retainer


def min_acv(retainer: float, meetings_per_month: float, target_roi: float = 5.0,
            meeting_to_opp: float = 0.50, opp_to_won: float = 0.25) -> float:
    """The smallest deal size that makes your retainer an easy yes.

    Invert the ROI formula. Everything below this number is a prospect who
    would need to be talked into it -- which, with no track record, you cannot
    do. Do not put them on the list.
    """
    per_meeting_needed = (retainer * target_roi) / meetings_per_month
    return per_meeting_needed / (meeting_to_opp * opp_to_won)


def qualifies(buyer: Buyer, retainer: float, meetings_per_month: float,
              target_roi: float = 5.0) -> bool:
    return roi(buyer, retainer, meetings_per_month) >= target_roi


# Rough ACV bands for markets a non-technical operator can credibly enter.
# These are estimates to sanity-check a shortlist, not researched figures --
# replace each one with a number you have confirmed before you build a list.
CANDIDATES: List[Buyer] = [
    Buyer("Commercial insurance brokerage", 18_000, 0.45, 0.20),
    Buyer("Bookkeeping / outsourced accounting", 24_000, 0.50, 0.25),
    Buyer("B2B SaaS, Series A", 35_000, 0.50, 0.22),
    Buyer("Managed IT services (MSP)", 45_000, 0.50, 0.25),
    Buyer("Fractional CFO / advisory", 60_000, 0.45, 0.25),
    Buyer("Software development agency", 90_000, 0.45, 0.20),
    Buyer("Healthcare revenue-cycle services", 110_000, 0.40, 0.22),
    Buyer("Industrial equipment supplier", 150_000, 0.40, 0.18),
]


def shortlist(retainer: float = 10_000.0, meetings_per_month: float = 10.0,
              buyers: Optional[List[Buyer]] = None,
              target_roi: float = 5.0) -> List[dict]:
    """Score each candidate market against your retainer."""
    buyers = buyers if buyers is not None else CANDIDATES
    out = []
    for b in buyers:
        r = roi(b, retainer, meetings_per_month)
        out.append({
            "name": b.name,
            "acv": b.acv,
            "meeting_value": b.meeting_value,
            "monthly_pipeline": meetings_per_month * b.meeting_value,
            "roi": r,
            "verdict": "easy yes" if r >= target_roi else "a fight" if r >= 3.0 else "no",
        })
    out.sort(key=lambda d: d["roi"], reverse=True)
    return out
