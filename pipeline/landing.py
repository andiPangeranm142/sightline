"""Landing-zone estimation for thrown (projectile) abilities.

Model (simple ballistic projection — an ESTIMATE, never a ground truth):

* Launch point = supplement ``interpolated.position`` (3D, GRID units).
* Initial velocity = ``view`` (unit aim vector) * nominal projectile speed
  for the ability class + the player's ``velocity`` at cast (a thrown
  projectile inherits the thrower's momentum).
* Gravity ``GRAVITY`` pulls the projectile down; the flight is integrated
  in fixed steps until the projectile falls back to ``DROP_BELOW_LAUNCH``
  units under its launch height (approximating flat ground below the
  caster's eye level) or ``MAX_FLIGHT_S`` elapses.
* The result is clamped to the map bounds and reported with a confidence
  score derived from the supplement record's ``quality`` and its
  ``interpolated.weight``.

Nominal speeds are modelling assumptions, NOT measured VALORANT constants —
GRID does not publish per-ability projectile speeds. Confidence is capped
at 0.75 for this reason. Abilities whose trajectory is not a simple
ballistic arc (map-targeted smokes, walls, drones, steered projectiles,
teleports, ground-targeted blasts) are EXCLUDED: no estimate is better
than a misleading one.
"""

from __future__ import annotations

import math
from typing import Any

GRAVITY = 800.0  # GRID units / s^2 (VALORANT-scale units, ~cm)
DROP_BELOW_LAUNCH = 150.0  # eye height above ground, GRID units
MAX_FLIGHT_S = 4.0
STEP_S = 0.02

METHOD = (
    "ESTIMATE: simple ballistic projection from supplement position + view "
    "+ velocity (nominal projectile speed per ability class, gravity "
    "800 u/s^2, flat ground 150 units below the throw point)"
)

# ability_id -> (nominal speed in GRID units/s, class label).
# Only thrown projectiles with a ballistic arc belong here.
THROWABLE_ABILITIES: dict[str, tuple[float, str]] = {
    # Sova — darts fly fast and flat.
    "recon-bolt": (2000.0, "dart"),
    "shock-bolt": (2000.0, "dart"),
    # KAY/O — thrown grenade / knife / flash.
    "frag-ment": (1100.0, "grenade"),
    "zero-point": (1400.0, "knife"),
    "flash-drive": (1400.0, "flash"),
    # Viper / Phoenix / Brimstone-style thrown mollies & grenades.
    "snake-bite": (1100.0, "molly"),
    "hot-hands": (1100.0, "molly"),
    "paint-shells": (1100.0, "grenade"),
    "nanoswarm": (1100.0, "grenade"),
    "blast-pack": (1100.0, "satchel"),
    # Fade — thrown orbs.
    "haunt": (1300.0, "orb"),
    "seize": (1300.0, "orb"),
    # Deadlock / Gekko / Tejo — thrown grenades.
    "gravnet": (1100.0, "grenade"),
    "mosh-pit": (1100.0, "grenade"),
    "dizzy": (1300.0, "orb"),
    "special-delivery": (1100.0, "grenade"),
    # Thrown flashes / smokes / bolts.
    "curveball": (1400.0, "flash"),
    "blindside": (1400.0, "flash"),
    "cloudburst": (1300.0, "smoke"),
    "cyber-cage": (1300.0, "smoke"),
    "relay-bolt": (1400.0, "bolt"),
    "undercut": (1400.0, "bolt"),
    "meddle": (1300.0, "orb"),
    "saturate": (1300.0, "orb"),
    "gatecrash": (1400.0, "tether"),
    "razorvine": (1100.0, "grenade"),
}


def is_throwable(ability_id: str) -> bool:
    """True if the ability is a thrown projectile this model applies to."""
    return ability_id in THROWABLE_ABILITIES


def confidence_for(record: dict[str, Any]) -> float:
    """Confidence 0-0.75 from supplement quality + interpolation weight.

    Base 0.35 (the model itself is approximate) + up to 0.25 from the
    interpolation weight + 0.10 for quality "ok" + 0.05 when a frame_after
    exists (a real post-cast frame anchors the interpolation).
    """
    conf = 0.35
    interp = record.get("interpolated") or {}
    weight = interp.get("weight")
    if isinstance(weight, (int, float)):
        conf += 0.25 * max(0.0, min(1.0, float(weight)))
    if record.get("quality") == "ok":
        conf += 0.10
    if record.get("frame_after"):
        conf += 0.05
    return round(min(0.75, conf), 2)


def project_landing(
    position: dict[str, float],
    view: dict[str, float],
    velocity: dict[str, float],
    ability_id: str,
) -> tuple[float, float] | None:
    """Project a landing (x, y) in RAW GRID coords, or None if unusable.

    Returns None when the view vector is degenerate (zero-length) or the
    launch data is missing — the caller then skips the record.
    """
    spec = THROWABLE_ABILITIES.get(ability_id)
    if spec is None:
        return None
    speed, _cls = spec
    vx, vy, vz = (float(view.get("x", 0.0)), float(view.get("y", 0.0)),
                  float(view.get("z", 0.0)))
    mag = math.sqrt(vx * vx + vy * vy + vz * vz)
    if mag < 1e-6:
        return None
    vx, vy, vz = vx / mag, vy / mag, vz / mag
    # Initial velocity: aim * speed + thrower momentum.
    px = vx * speed + float(velocity.get("x", 0.0))
    py = vy * speed + float(velocity.get("y", 0.0))
    pz = vz * speed + float(velocity.get("z", 0.0))
    x = float(position.get("x", 0.0))
    y = float(position.get("y", 0.0))
    z = float(position.get("z", 0.0))
    ground_z = z - DROP_BELOW_LAUNCH
    t = 0.0
    while t < MAX_FLIGHT_S:
        pz -= GRAVITY * STEP_S
        x += px * STEP_S
        y += py * STEP_S
        z += pz * STEP_S
        t += STEP_S
        if z <= ground_z:
            break
    return (x, y)
