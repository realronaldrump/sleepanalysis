"""
Medication Data Service.

Contains a comprehensive database of medication half-lives and logic for
normalizing medication names and retrieving their properties.
"""

from typing import Optional, Dict
import difflib

# Default half-life in hours if unknown
DEFAULT_HALF_LIFE = 4.0

# Comprehensive map of medication half-lives (in hours).
# Based on clinical data. For ranges, we generally use the average.
MEDICATION_HALF_LIVES: Dict[str, float] = {
    # Supplements & Nootropics
    "acetyl_l_carnitine": 32.5,  # 29-36h
    "agmatine": 2.0,
    "apigenin": 12.0,
    "astaxanthin": 16.0,
    "lycopene": 120.0, # ~5 days
    "caffeine": 5.0, # 3-7h
    "citicoline": 60.0, # 50-70h
    "coenzyme_q10": 33.0,
    "glycine": 2.0, # 0.5-4h
    "huperzine_a": 12.0, # 10-14h
    "inositol": 5.0,
    "kava": 9.0, # Estimating average for kavalactones, though variable
    "l_theanine": 1.5, # 1-2h
    "magnesium": 24.0, # Functional daily turnover approx, though biological is long
    "melatonin": 0.7, # 20-60 min
    "mucuna_pruriens": 2.0, # Levodopa half life ~1.5h
    "nac": 5.6, # N-acetylcysteine ~5.6h
    "omega_3": 79.0, # EPA
    "phenibut": 5.0, 
    "sulbutiamine": 5.0,
    "taurine": 1.0, # 0.7-1.4h
    "uridine": 2.0,
    "vitamin_a": 24.0, # Complex, using 24h as rough functional window for daily dosing
    "vitamin_c": 12.0, # Complex turnover
    "vitamin_d3": 360.0, # 15 days
    "zinc": 24.0, # Daily turnover approx
    "copper": 24.0, # Daily turnover approx
    
    # Prescription / OTC Meds
    "amphetamine": 12.0, # 10-14h
    "bupropion": 21.0,
    "clindamycin": 2.5,
    "clonidine": 14.0, # 12-16h
    "daridorexant": 8.0,
    "dexmethylphenidate": 3.0, # 2-4h
    "diphenhydramine": 6.5, # 4-9h
    "doxylamine": 11.0, # 10-12h
    "esomeprazole": 1.3,
    "eszopiclone": 6.0,
    "finasteride": 5.5, # 5-6h
    "fluvoxamine": 18.0, # 15-22h
    "gabapentin": 6.0, # 5-7h
    "lamotrigine": 29.0, # 25-33h
    "lemborexant": 18.0, # 17-19h
    "lisdexamfetamine": 1.0, # Prodrug, short half life itself
    "methylphenidate": 2.5, # 2-3h
    "mirtazapine": 30.0, # 20-40h
    "naproxen": 14.5, # 12-17h
    "ondansetron": 4.5, # 3-6h
    "paroxetine": 21.0,
    "pregabalin": 6.0,
    "propranolol": 4.5, # 3-6h
    "quetiapine": 6.0,
    "temazepam": 14.0, # 8-20h
    "tizanidine": 2.5,
    "trazodone": 7.0, # 5-9h
    "triazolam": 3.0, # 1.5-5.5h
    "zaleplon": 1.0,
    "zolpidem": 2.5, # 2-3h
    
    # Cannabis
    "thc": 30.0, # Terminal ~25-36h
    "cbd": 24.0, # 18-32h
}

# Mapping of specific variants/brand names to canonical keys
VARIANT_MAPPING = {
    # ADHD / Stimulants
    "adderall": "amphetamine",
    "vyvanse": "amphetamine", # Active metabolite
    "dexmethylphenidate": "dexmethylphenidate",
    "focalin": "dexmethylphenidate",
    "concerta": "methylphenidate",
    "ritalin": "methylphenidate",
    
    # Sleep / Sedatives
    "quviviq": "daridorexant",
    "ambien": "zolpidem",
    "lunesta": "eszopiclone",
    "dayvigo": "lemborexant",
    "sonata": "zaleplon",
    "restoril": "temazepam",
    "halcion": "triazolam",
    "unisom": "doxylamine",
    "benadryl": "diphenhydramine",
    "zzzzquil": "diphenhydramine",
    
    # Antidepressants / Anxiolytics
    "luvox": "fluvoxamine",
    "remeron": "mirtazapine",
    "paxil": "paroxetine",
    "wellbutrin": "bupropion",
    "neurontin": "gabapentin",
    "lyrica": "pregabalin",
    "lamictal": "lamotrigine",
    "seroquel": "quetiapine",
    "desyrel": "trazodone",
    
    # Supplements
    "coq10": "coenzyme_q10",
    "magnesium_glycinate": "magnesium",
    "magnesium_threonate": "magnesium",
    "mag_glycinate": "magnesium",
    "ashwagandha": "ashwagandha",
    "theanine": "l_theanine",
    "fish_oil": "omega_3",
    "epa": "omega_3",
    "dha": "omega_3",
}

def normalize_medication_name(name: str) -> str:
    """
    Normalize a medication name string to a canonical key.
    
    1. Lowercase and replace spaces/dashes with underscores.
    2. Check exact match in database.
    3. Check variant mapping.
    4. Fuzzy match against known keys.
    """
    clean_name = name.lower().strip().replace(" ", "_").replace("-", "_")
    
    # 1. Direct match
    if clean_name in MEDICATION_HALF_LIVES:
        return clean_name
        
    # 2. Variant match
    if clean_name in VARIANT_MAPPING:
        return VARIANT_MAPPING[clean_name]
    
    # 3. Substring check (e.g. "magnesium_complex" -> "magnesium")
    for key in MEDICATION_HALF_LIVES:
        if key in clean_name:
            return key
    
    # 4. Fuzzy match
    all_keys = list(MEDICATION_HALF_LIVES.keys()) + list(VARIANT_MAPPING.keys())
    matches = difflib.get_close_matches(clean_name, all_keys, n=1, cutoff=0.6)
    
    if matches:
        match = matches[0]
        # If it matched a variant, resolve to canonical
        return VARIANT_MAPPING.get(match, match)
        
    return clean_name

def get_medication_half_life(name: str) -> float:
    """
    Get the half-life in hours for a given medication name.
    Returns default if unknown.
    """
    key = normalize_medication_name(name)
    return MEDICATION_HALF_LIVES.get(key, DEFAULT_HALF_LIFE)
