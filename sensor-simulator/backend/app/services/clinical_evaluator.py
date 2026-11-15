from app.schemas.telemetry_v1_1 import (
    ClinicalAlert,
    ClinicalStatus,
    TelemetryPacketV1_1,
)

SEVERITY_RANK: dict[ClinicalStatus, int] = {
    "normal": 0,
    "attention": 1,
    "critical": 2,
}


def evaluate_telemetry_packet(
    packet: TelemetryPacketV1_1,
    consecutive_nights_under_6h: int,
    career_accumulated_msv: float,
    career_limit_msv: float,
) -> tuple[ClinicalStatus, list[ClinicalAlert]]:
    alerts: list[ClinicalAlert] = []
    activity = packet.mission_context.activity_state

    def add_alert(
        system: str,
        severity: ClinicalStatus,
        hazard: str,
        message: str,
        action: str,
    ):
        alerts.append(
            ClinicalAlert(
                system=system,
                severity=severity,
                nasa_hazard=hazard,
                message=message,
                recommended_action=action,
            )
        )

    # 1. Cabin Environment (CO2)
    co2 = packet.mission_context.environment.cabin_co2_mmhg
    if co2 is not None:
        if co2 >= 3.0:
            add_alert(
                "environment",
                "critical",
                "Hostile Closed Environment",
                f"Cabin CO2 at {co2} mmHg exceeds NASA 3.0 mmHg operational limit.",
                "Inspect ECLSS CO2 scrubbers immediately and ventilate crew quarters.",
            )
        elif co2 >= 2.3:
            add_alert(
                "environment",
                "attention",
                "Hostile Closed Environment",
                f"Elevated cabin CO2 ({co2} mmHg); headache and fatigue threshold reached.",
                "Increase cabin airflow and verify scrubber efficiency.",
            )

    # 2. Cardiovascular (Activity-aware HR + Periodic BP)
    cv = packet.biometrics.cardiovascular
    if cv.signal_quality == "lost":
        add_alert(
            "cardiovascular",
            "attention",
            "Distance from Earth",
            "Cardiovascular telemetry signal lost.",
            "Check Bio-Monitor thoracic electrode contact.",
        )
    else:
        if cv.signal_quality == "degraded":
            add_alert(
                "cardiovascular",
                "attention",
                "Altered Gravity",
                "Degraded cardiovascular waveform (fluid shift / motion artifact).",
                "Cross-check pulse with stationary reading before clinical escalation.",
            )

        hr = cv.heart_rate_bpm
        if hr is not None:
            if activity in ("exercising", "eva"):
                if hr > 170 or hr < 45:
                    add_alert(
                        "cardiovascular",
                        "critical",
                        "Altered Gravity",
                        f"Critical heart rate ({hr} bpm) during {activity}.",
                        "Halt EVA/exercise immediately and initiate hemodynamic recovery.",
                    )
                elif hr > 150:
                    add_alert(
                        "cardiovascular",
                        "attention",
                        "Altered Gravity",
                        f"High exertion heart rate ({hr} bpm) during {activity}.",
                        "Pace workload and verify post-activity recovery under 110 bpm.",
                    )
            elif activity == "sleeping":
                if hr < 38 or hr > 100:
                    add_alert(
                        "cardiovascular",
                        "critical",
                        "Altered Gravity",
                        f"Abnormal nocturnal heart rate ({hr} bpm) during sleep.",
                        "Trigger crew wake-up check and 12-lead ECG.",
                    )
            else:  # resting, working, post_exercise_recovery
                if hr < 40 or hr >= 130:
                    add_alert(
                        "cardiovascular",
                        "critical",
                        "Altered Gravity",
                        f"Critical resting heart rate ({hr} bpm).",
                        "Initiate 12-lead ECG, evaluate hypovolemia, and notify Flight Surgeon.",
                    )
                elif hr > 110 or (50 <= hr <= 59) or (101 <= hr <= 110):
                    add_alert(
                        "cardiovascular",
                        "attention",
                        "Altered Gravity",
                        f"Heart rate deviation ({hr} bpm) in {activity} state.",
                        "Assess hydration status and aerobic countermeasure compliance.",
                    )

        sbp = cv.blood_pressure_systolic_mmhg
        dbp = cv.blood_pressure_diastolic_mmhg
        if sbp is not None and dbp is not None:
            if sbp >= 160 or sbp < 80 or dbp >= 100 or dbp < 50:
                add_alert(
                    "cardiovascular",
                    "critical",
                    "Altered Gravity",
                    f"Critical blood pressure ({sbp}/{dbp} mmHg).",
                    "Activate emergency medical protocol and LBNP countermeasures if hypotensive.",
                )
            elif sbp >= 140 or sbp < 90 or dbp >= 90 or dbp < 60:
                add_alert(
                    "cardiovascular",
                    "attention",
                    "Altered Gravity",
                    f"Blood pressure outside nominal orbital range ({sbp}/{dbp} mmHg).",
                    "Evaluate for SANS symptoms (headache/vision) or orthostatic intolerance.",
                )

    # 3. Respiratory (SpO2 & Respiratory Rate)
    resp = packet.biometrics.respiratory
    if resp.signal_quality == "lost":
        add_alert(
            "respiratory",
            "attention",
            "Hostile Closed Environment",
            f"Respiratory sensor ({resp.sensor_hardware}) signal lost.",
            "Verify pulse oximeter placement or EVA suit telemetry link.",
        )
    else:
        if resp.spo2_percent is not None:
            if resp.spo2_percent < 90.0:
                add_alert(
                    "respiratory",
                    "critical",
                    "Hostile Closed Environment",
                    f"Severe hypoxemia detected (SpO2: {resp.spo2_percent}%).",
                    "Verify suit/cabin O2 partial pressure immediately and administer supplemental O2.",
                )
            elif resp.spo2_percent < 95.0:
                add_alert(
                    "respiratory",
                    "attention",
                    "Hostile Closed Environment",
                    f"Borderline SpO2 ({resp.spo2_percent}%).",
                    "Monitor respiration and check cabin O2/CO2 mixture.",
                )

    # 4. Thermoregulation (Core Temperature)
    thermo = packet.biometrics.thermoregulation
    if thermo.signal_quality == "lost":
        add_alert(
            "thermoregulation",
            "attention",
            "Hostile Closed Environment",
            "Core temperature sensor signal lost.",
            "Check Double Sensor forehead adhesion.",
        )
    elif thermo.core_temp_c is not None:
        temp = thermo.core_temp_c
        if activity in ("exercising", "eva"):
            if temp >= 40.0:
                add_alert(
                    "thermoregulation",
                    "critical",
                    "Hostile Closed Environment",
                    f"Heat stroke risk during {activity} (Core Temp: {temp} °C).",
                    "Stop activity immediately, apply active cooling, and maximize airflow.",
                )
            elif temp >= 38.5:
                add_alert(
                    "thermoregulation",
                    "attention",
                    "Hostile Closed Environment",
                    f"Exercise-induced core temperature rise ({temp} °C) in zero-convection.",
                    "Ensure core temperature drops below 38.0 °C within 30 minutes of rest.",
                )
        else:
            if temp >= 39.0:
                add_alert(
                    "thermoregulation",
                    "critical",
                    "Hostile Closed Environment",
                    f"High resting fever/hyperthermia ({temp} °C).",
                    "Initiate active cooling, hydration, and infectious screening.",
                )
            elif temp >= 38.0 or (activity == "post_exercise_recovery" and temp > 38.0):
                add_alert(
                    "thermoregulation",
                    "attention",
                    "Hostile Closed Environment",
                    f"Space fever threshold reached ({temp} °C).",
                    "Direct forced ventilation onto crew member and re-check in 30 minutes.",
                )

    # 5. Daily Sleep & PVT-B Assessment
    daily = packet.daily_assessment
    if daily is not None and daily.signal_quality != "lost":
        sleep_h = daily.sleep_hours_last_night
        if sleep_h is not None:
            if sleep_h < 4.0 and consecutive_nights_under_6h >= 3:
                add_alert(
                    "sleep_and_fatigue",
                    "critical",
                    "Isolation and Confinement",
                    f"Severe cumulative sleep deprivation ({sleep_h}h; {consecutive_nights_under_6h} nights <6h).",
                    "Suspend critical EVA/docking tasks and enforce circadian recovery block.",
                )
            elif sleep_h < 6.0 or consecutive_nights_under_6h >= 2:
                add_alert(
                    "sleep_and_fatigue",
                    "attention",
                    "Isolation and Confinement",
                    f"Sleep deficit ({sleep_h}h last night; streak: {consecutive_nights_under_6h} nights).",
                    "Protect 8.5h scheduled sleep window and block orbital sunrise blue-light exposure.",
                )

    # 6. Radiation Dosimetry & Solar Particle Event (SPE)
    rad = packet.radiation_dosimetry
    if rad.signal_quality == "lost":
        add_alert(
            "radiation",
            "attention",
            "Space Radiation",
            "Active dosimeter telemetry lost.",
            "Switch to backup area dosimeter and verify passive TLD/OSLD logging.",
        )
    else:
        spe = rad.solar_particle_event
        if spe.active and (spe.event_dose_msv or 0.0) >= 250.0:
            add_alert(
                "radiation",
                "critical",
                "Space Radiation",
                f"CRITICAL SOLAR PARTICLE EVENT ({spe.event_dose_msv} mSv >= 250 mSv NASA limit).",
                "Take immediate shelter in heavily shielded storm module until SPE subsides.",
            )
        elif spe.active:
            add_alert(
                "radiation",
                "attention",
                "Space Radiation",
                f"Active Solar Particle Event in progress ({spe.event_dose_msv or 0.0} mSv).",
                "Cancel EVA operations and remain inside polyethylene/water-shielded quarters.",
            )

        career_pct = (career_accumulated_msv / career_limit_msv) * 100.0
        if career_pct >= 100.0:
            add_alert(
                "radiation",
                "critical",
                "Space Radiation",
                f"Career radiation limit reached ({career_accumulated_msv:.1f} / {career_limit_msv} mSv).",
                "Restrict further spaceflight radiation exposure per agency medical standards.",
            )
        elif career_pct >= 60.0:
            add_alert(
                "radiation",
                "attention",
                "Space Radiation",
                f"Career radiation budget at {career_pct:.1f}% ({career_accumulated_msv:.1f} mSv).",
                "Optimize task rotation in high-shielding habitat zones.",
            )

    # Determine highest overall severity
    overall: ClinicalStatus = "normal"
    for alert in alerts:
        if SEVERITY_RANK[alert.severity] > SEVERITY_RANK[overall]:
            overall = alert.severity

    return overall, alerts