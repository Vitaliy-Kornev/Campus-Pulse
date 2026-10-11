"""Starter categories for club profiles and events. Recommendations compare clubs and events by these.

Codes are stored in the database; labels can be reworded freely. Add entries at the end of a group;
never reuse a retired code for a different meaning.
"""

CLUB_TYPES = [
    ("academic", "Academic & professional"),
    ("cultural", "Cultural & identity"),
    ("greek", "Greek life"),
    ("sports", "Sports & recreation"),
    ("arts", "Arts & performance"),
    ("service", "Service & volunteering"),
    ("faith", "Faith & spirituality"),
    ("advocacy", "Advocacy & politics"),
    ("hobby", "Hobbies & gaming"),
    ("other", "Other"),
]

# Fields of study, grouped by UMN college. Clubs pick any number; a shared field is the strongest
# similarity signal, and a shared college a weaker one.
FIELD_GROUPS = [
    ("College of Science & Engineering", [
        ("computer-science", "Computer science"),
        ("computer-engineering", "Computer & electrical engineering"),
        ("mechanical-engineering", "Mechanical engineering"),
        ("aerospace-engineering", "Aerospace engineering"),
        ("civil-engineering", "Civil & environmental engineering"),
        ("chemical-engineering", "Chemical engineering"),
        ("biomedical-engineering", "Biomedical engineering"),
        ("industrial-engineering", "Industrial & systems engineering"),
        ("materials-science", "Materials science"),
        ("data-science", "Data science"),
        ("mathematics", "Mathematics"),
        ("physics", "Physics & astronomy"),
        ("chemistry", "Chemistry"),
        ("earth-sciences", "Earth sciences"),
    ]),
    ("Carlson School of Management", [
        ("accounting", "Accounting"),
        ("finance", "Finance"),
        ("marketing", "Marketing"),
        ("entrepreneurship", "Management & entrepreneurship"),
        ("supply-chain", "Supply chain & operations"),
        ("information-systems", "Information systems"),
    ]),
    ("College of Liberal Arts", [
        ("economics", "Economics"),
        ("political-science", "Political science"),
        ("psychology", "Psychology"),
        ("journalism", "Journalism & communication"),
        ("english", "English & writing"),
        ("history", "History"),
        ("languages", "Languages & linguistics"),
        ("sociology", "Sociology & anthropology"),
        ("music", "Music"),
        ("theatre-dance", "Theatre & dance"),
        ("studio-art", "Studio art"),
        ("statistics", "Statistics"),
    ]),
    ("College of Biological Sciences", [
        ("biology", "Biology"),
        ("biochemistry", "Biochemistry"),
        ("neuroscience", "Neuroscience"),
        ("genetics", "Genetics & cell biology"),
    ]),
    ("Health sciences", [
        ("pre-med", "Pre-med & pre-health"),
        ("nursing", "Nursing"),
        ("pharmacy", "Pharmacy"),
        ("public-health", "Public health"),
        ("kinesiology", "Kinesiology"),
    ]),
    ("Food, Agricultural & Natural Resource Sciences", [
        ("environmental-science", "Environmental science"),
        ("agriculture", "Agriculture & food science"),
        ("animal-science", "Animal science"),
    ]),
    ("Education & Human Development", [
        ("education", "Education"),
        ("family-social-science", "Family & social science"),
    ]),
    ("College of Design", [
        ("architecture", "Architecture"),
        ("graphic-design", "Graphic design"),
        ("apparel-design", "Apparel & product design"),
    ]),
    ("Any field", [
        ("all-majors", "Open to all majors"),
    ]),
]

EVENT_TYPES = [
    ("info-session", "Info session or general meeting"),
    ("workshop", "Workshop or class"),
    ("speaker", "Speaker or panel"),
    ("social", "Social"),
    ("competition", "Competition or hackathon"),
    ("recruitment", "Recruitment or rush"),
    ("career", "Career or networking"),
    ("fundraiser", "Fundraiser"),
    ("performance", "Performance or show"),
    ("volunteering", "Volunteering"),
    ("game", "Game or tournament"),
    ("cultural", "Cultural celebration"),
    ("other", "Other"),
]

FIELDS = [field for _, fields in FIELD_GROUPS for field in fields]
FIELD_LABELS = dict(FIELDS)
FIELD_COLLEGE = {code: college for college, fields in FIELD_GROUPS for code, _ in fields}
CLUB_TYPE_LABELS = dict(CLUB_TYPES)
EVENT_TYPE_LABELS = dict(EVENT_TYPES)


def as_json():
    """The lists the frontend renders in its pickers."""
    return {
        "club_types": [{"value": v, "label": label} for v, label in CLUB_TYPES],
        "field_groups": [
            {"label": college, "fields": [{"value": v, "label": label} for v, label in fields]} for college, fields in FIELD_GROUPS
        ],
        "event_types": [{"value": v, "label": label} for v, label in EVENT_TYPES],
    }
