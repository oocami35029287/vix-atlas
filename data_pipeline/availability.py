from datetime import datetime

def as_of(versions,decision_at):
    cutoff=datetime.fromisoformat(decision_at)
    eligible=[v for v in versions if v.get('availability_basis') in ('observed','historical_evidence') and v.get('available_from') and datetime.fromisoformat(v['available_from'])<=cutoff]
    return max(eligible,key=lambda v:datetime.fromisoformat(v['available_from'])) if eligible else None
