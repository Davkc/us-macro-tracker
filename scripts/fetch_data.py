"""Build the public JSON dataset from FRED without exposing the API key."""
import json, os, sys
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "indicators.json"
API = "https://api.stlouisfed.org/fred/series/observations"
# Add a series by adding one entry here.
SERIES = {
 "cpi":("CPIAUCSL","Headline CPI","index","monthly","mean","lower"),
 "coreCpi":("CPILFESL","Core CPI","index","monthly","mean","lower"),
 "ppi":("PPIACO","PPI All Commodities","index","monthly","mean","lower"),
 "ppiFinal":("PPIFIS","PPI Final Demand","index","monthly","mean","lower"),
 "fedfunds":("FEDFUNDS","Federal Funds Rate","percent","monthly","mean","lower"),
 "dff":("DFF","Daily Federal Funds Rate","percent","daily","mean","lower"),
 "mortgage30":("MORTGAGE30US","30-Year Mortgage","percent","weekly","mean","lower"),
 "mortgage15":("MORTGAGE15US","15-Year Mortgage","percent","weekly","mean","lower"),
 "gas":("GASREGW","Regular Gasoline","dollars_per_gallon","weekly","mean","lower"),
 "gdp":("GDPC1","Real GDP","billions_of_chained_dollars","quarterly","last","higher"),
 "unemployment":("UNRATE","Unemployment Rate","percent","monthly","mean","lower"),
 "sentiment":("UMCSENT","Consumer Sentiment","index","monthly","mean","higher"),
 "recession":("USREC","US Recession Indicator","binary","monthly","max","neutral"),
}
def fetch(series_id, key):
    response=requests.get(API,params={"series_id":series_id,"api_key":key,"file_type":"json","observation_start":"1900-01-01","sort_order":"asc"},timeout=45)
    response.raise_for_status()
    rows=[]
    for row in response.json().get("observations",[]):
        raw=row.get("value")
        if raw in (None,"","."): continue
        try: rows.append((pd.Timestamp(row["date"]),float(raw)))
        except (TypeError,ValueError): continue
    if not rows: raise ValueError("No valid observations for "+series_id)
    return pd.Series([v for _,v in rows],index=pd.DatetimeIndex([d for d,_ in rows])).sort_index()
def changes(series, freq, recession):
    records=[]
    for i,(date,value) in enumerate(series.items()):
        qbase=series.iloc[i-3] if freq=="monthly" and i>=3 else (series.iloc[i-1] if i else None)
        yearbase=series.iloc[i-(12 if freq=="monthly" else 4)] if i>=(12 if freq=="monthly" else 4) else None
        prior=series.iloc[i-1] if i else None
        def pct(base): return round((value/base-1)*100,4) if base is not None and base!=0 else None
        period=date.to_period("M").start_time if freq=="monthly" else date.to_period("Q").start_time
        rec=recession.get(period,0)
        row={"date":date.strftime("%Y-%m-%d"),"value":round(float(value),6),"mom":pct(prior) if freq=="monthly" else None,"qoq":pct(qbase),"yoy":pct(yearbase),"recession":int(bool(rec))}
        if freq=="quarterly": row["last_value"]=round(float(value),6)
        records.append(row)
    return records
def main():
    key=os.getenv("FRED_API_KEY","").strip()
    if not key: print("FRED_API_KEY is required",file=sys.stderr); return 2
    raw={name:fetch(cfg[0],key) for name,cfg in SERIES.items()}
    recession=raw["recession"].resample("MS").max().dropna()
    result={"schema_version":1,"generated_at":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z"),"sample_data":False,"source":"Federal Reserve Bank of St. Louis FRED","series":{}}
    for name,cfg in SERIES.items():
        sid,label,units,source_freq,agg,direction=cfg
        source=raw[name]
        if source_freq=="quarterly": monthly=pd.Series(dtype=float)
        else: monthly=source.resample("MS").agg(agg).dropna()
        quarterly=source.resample("QS-JAN").agg(agg).dropna()
        mr=recession.reindex(monthly.index,fill_value=0); qr=recession.resample("QS-JAN").max().reindex(quarterly.index,fill_value=0)
        result["series"][name]={"fred_id":sid,"name":label,"units":units,"frequency":source_freq,"direction":direction,"source":"FRED: "+sid,"latest":{"date":source.index[-1].strftime("%Y-%m-%d"),"value":float(source.iloc[-1])},"monthly":changes(monthly,"monthly",mr),"quarterly":changes(quarterly,"quarterly",qr)}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    temp=OUT.with_suffix(".tmp")
    temp.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    temp.replace(OUT)
    print("Updated",OUT)
    return 0
if __name__=="__main__": raise SystemExit(main())
