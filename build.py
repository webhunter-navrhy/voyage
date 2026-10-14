#!/usr/bin/env python3
"""Build webu VOYAGE: _data/*.json + src/*.html (Jinja2) + img/ + static/ -> dist/

  python3 build.py            # sestaví dist/
  python3 build.py --serve    # + lokální server na http://localhost:8765/<base>

Spouští ho i GitHub Action po každém uložení v administraci (webhunter-admin, /admin/).
Fotky v img/ jsou už WebP (admin je při nahrání zmenší); build k nim přidá -sm variantu 640 px pro srcset.
Expedice: každá viditelná dostane stránku /expedice/<slug>/. Proběhlé (podle data „do“) jdou do archivu –
při buildu i v prohlížeči (main.js), takže se přesunou samy i bez nového buildu.
Co dělá dál: ?v=<hash> u CSS/JS, noindex + robots podle site.navrh, JSON-LD (TravelAgency, TouristTrip, FAQPage),
og:image 1200x630 (úvod i každá expedice), sitemap.xml, 404.html, .nojekyll, version.json (pro admin), CNAME u ostrého webu.
"""
import datetime
import hashlib
import json
import os
import re
import shutil
import sys

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup, escape
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, DATA, STATIC, DIST, CACHE = (os.path.join(ROOT, p) for p in ("src", "_data", "static", "dist", ".cache/img"))
MESICE = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"]
MESICE1 = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"]


class BuildError(Exception):
    pass


def nacti(nazev):
    with open(os.path.join(DATA, nazev + ".json"), encoding="utf-8") as fh:
        return json.load(fh)


def hash_souboru(cesta):
    return hashlib.sha1(open(cesta, "rb").read()).hexdigest()[:10]


# ---------------------------------------------------------------- texty
NB = re.compile(r"(^|[\s(„])([ksvzouaiKSVZOUAI])\s+")


def nb(s):
    """nezlomitelná mezera po jednopísmenných předložkách a spojkách + mezi číslem a jednotkou"""
    if not s:
        return ""
    s = str(s)
    s = NB.sub(lambda m: m.group(1) + m.group(2) + "\u00a0", s)
    s = NB.sub(lambda m: m.group(1) + m.group(2) + "\u00a0", s)
    s = re.sub(r"(\d)\s(Kč|osob|dní|nocí|km|%)", "\\1\u00a0\\2", s)
    s = re.sub(r"(\d) (\d{3})", "\\1\u00a0\\2", s)
    return s


def odstavce(s):
    return Markup("".join(f"<p>{escape(nb(p.strip()))}</p>" for p in str(s or "").split("\n") if p.strip()))


def datum(iso):
    return datetime.date.fromisoformat(iso)


def termin(e):
    """„22.–31. října 2026“, „28. března – 6. dubna 2026“, nebo ruční text („leden 2027“)"""
    if e.get("termin_text"):
        return e["termin_text"]
    a, b = datum(e["od"]), datum(e["do"])
    if a == b:
        return f"{a.day}. {MESICE[a.month - 1]} {a.year}"
    if a.year == b.year and a.month == b.month:
        return f"{a.day}.–{b.day}. {MESICE[b.month - 1]} {b.year}"
    if a.year == b.year:
        return f"{a.day}. {MESICE[a.month - 1]} – {b.day}. {MESICE[b.month - 1]} {b.year}"
    return f"{a.day}. {MESICE[a.month - 1]} {a.year} – {b.day}. {MESICE[b.month - 1]} {b.year}"


def termin_kratce(e):
    """22. 10. – 31. 10. 2026 / 01/2027"""
    if e.get("termin_text"):
        return e["termin_text"]
    a, b = datum(e["od"]), datum(e["do"])
    if a.year == b.year:
        return f"{a.day}. {a.month}. – {b.day}. {b.month}. {b.year}"
    return f"{a.day}. {a.month}. {a.year} – {b.day}. {b.month}. {b.year}"


def delka(e):
    if e.get("termin_text"):
        return ""
    dni = (datum(e["do"]) - datum(e["od"])).days + 1
    noci = dni - 1
    sl = lambda n, a, b, c: a if n == 1 else (b if 2 <= n <= 4 else c)
    return f"{dni} {sl(dni, 'den', 'dny', 'dní')} / {noci} {sl(noci, 'noc', 'noci', 'nocí')}"


def mista(n):
    n = int(n or 0)
    if n <= 0:
        return "Obsazeno"
    if n == 1:
        return "Poslední volné místo"
    return f"{n} volná místa" if n <= 4 else f"{n} volných míst"


# ---------------------------------------------------------------- obrázky
class Obrazky:
    def __init__(self, base):
        self.base = base
        self.pocet = 0
        self.hotovo = {}
        os.makedirs(CACHE, exist_ok=True)

    def reset(self):
        self.pocet = 0

    def _priprav(self, cesta):
        """img/… z repozitáře -> dist (originál + -sm 640 px)"""
        if cesta in self.hotovo:
            return self.hotovo[cesta]
        zdroj = os.path.join(ROOT, cesta)
        if not os.path.exists(zdroj):
            raise BuildError(f"obrázek {cesta} neexistuje")
        cil = os.path.join(DIST, cesta)
        os.makedirs(os.path.dirname(cil), exist_ok=True)
        shutil.copy(zdroj, cil)
        im = ImageOps.exif_transpose(Image.open(zdroj))
        w, h = im.size
        var = [(w, cesta)]
        if w > 900:
            stem = os.path.splitext(cesta)[0]
            sm = f"{stem}-sm.webp"
            kes = os.path.join(CACHE, hash_souboru(zdroj) + "-640.webp")
            if not os.path.exists(kes):
                r = im.convert("RGB").resize((640, round(h * 640 / w)), Image.LANCZOS)
                r.save(kes, "WEBP", quality=78, method=6)
            shutil.copy(kes, os.path.join(DIST, sm))
            var.insert(0, (640, sm))
        self.hotovo[cesta] = {"w": w, "h": h, "var": var}
        return self.hotovo[cesta]

    def img(self, foto, alt=None, sizes="100vw", cls="", eager=None):
        if isinstance(foto, dict):
            cesta, alt = foto.get("src"), alt if alt is not None else foto.get("alt", "")
        else:
            cesta = foto
        if alt is None:
            raise BuildError(f"img('{cesta}'): chybí alt")
        if not cesta:
            return Markup("")
        self.pocet += 1
        prvni = (self.pocet == 1) if eager is None else eager
        i = self._priprav(cesta)
        srcset = ", ".join(f"{self.base}{p} {w}w" for w, p in i["var"])
        nac = 'loading="eager" fetchpriority="high"' if prvni else 'loading="lazy"'
        c = f' class="{cls}"' if cls else ""
        return Markup(f'<img src="{self.base}{cesta}" srcset="{srcset}" sizes="{sizes}" width="{i["w"]}" height="{i["h"]}" '
                      f'alt="{escape(alt)}"{c} {nac} decoding="async">')

    def url(self, cesta, male=False):
        if not cesta:
            return ""
        i = self._priprav(cesta)
        return self.base + (i["var"][0][1] if male else cesta)

    def og(self, cesta, cil):
        zdroj = os.path.join(ROOT, cesta)
        if not os.path.exists(zdroj):
            return None
        os.makedirs(os.path.dirname(os.path.join(DIST, cil)), exist_ok=True)
        im = ImageOps.fit(ImageOps.exif_transpose(Image.open(zdroj)).convert("RGB"), (1200, 630), Image.LANCZOS, centering=(0.5, 0.45))
        im.save(os.path.join(DIST, cil), quality=84, optimize=True)
        return cil


# ---------------------------------------------------------------- JSON-LD
def ld(obj):
    return Markup(json.dumps(obj, ensure_ascii=False).replace("</", "<\\/"))


def main():
    site, texty, exp, pruvodci, faq = (nacti(n) for n in ("site", "texty", "expedice", "pruvodci", "faq"))
    domena = site.get("domena", "").strip()
    ostry = bool(domena) and not site.get("navrh")
    base = "/" if ostry else site.get("base", "/")
    url_webu = f"https://{domena}/" if ostry else site["url"]
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    obr = Obrazky(base)

    hashe = {}

    def asset(p):
        cil = os.path.join(DIST, p)
        if not os.path.exists(cil):
            raise BuildError(f"asset {p} neexistuje (static/{p})")
        hashe.setdefault(p, hash_souboru(cil))
        return f"{base}{p}?v={hashe[p]}"

    def url(cesta=""):
        cesta = cesta.strip("/")
        return base + (cesta + "/" if cesta else "")

    # expedice: viditelné, seřazené podle začátku; budoucí vs. proběhlé
    dnes = datetime.date.today()
    slugy = set()
    for e in exp:
        if not e.get("slug"):
            raise BuildError(f"expedice „{e.get('nazev')}“ nemá slug")
        if e["slug"] in slugy:
            raise BuildError(f"slug {e['slug']} je dvakrát")
        slugy.add(e["slug"])
        e.setdefault("galerie", [])
        e.setdefault("zazitky", [])
        e.setdefault("program", [])
    vid = sorted([e for e in exp if not e.get("skryta")], key=lambda e: e["od"])
    for e in vid:
        e["probehla"] = datum(e["do"]) < dnes
    budouci = [e for e in vid if not e["probehla"]]
    probehle = sorted([e for e in vid if e["probehla"]], key=lambda e: e["do"], reverse=True)
    kat = {k["id"]: k["nazev"] for k in texty["kategorie"]}

    og_uvod = obr.og(site["og_image"], "og.jpg") if site.get("og_image") else None

    env = Environment(loader=FileSystemLoader(SRC), autoescape=select_autoescape(["html"]), undefined=StrictUndefined,
                      trim_blocks=True, lstrip_blocks=True)
    env.filters.update(nb=nb, odstavce=odstavce, termin=termin, termin_kratce=termin_kratce, delka=delka, mista=mista,
                       tojson_attr=lambda o: json.dumps(o, ensure_ascii=False))
    org = {"@type": "TravelAgency", "@id": url_webu + "#org", "name": site["nazev"], "url": url_webu,
           "description": site["popis"], "email": site.get("email") or None, "logo": url_webu + "favicon.svg",
           "sameAs": [site["instagram"]] if site.get("instagram") else None}
    if site.get("ico"):
        org["taxID"] = site["ico"]
    org = {k: v for k, v in org.items() if v}
    env.globals.update(site=site, T=texty, base=base, asset=asset, url=url, img=obr.img, img_url=obr.url,
                       budouci=budouci, probehle=probehle, vsechny=vid, pruvodci=pruvodci, faq=faq, kat=kat,
                       rok=dnes.year, url_webu=url_webu, ostry=ostry, ld=ld, org=org,
                       org_ld={"@context": "https://schema.org", **org})

    stranky = []

    def render(sablona, cesta, **kw):
        obr.reset()
        kod = env.get_template(sablona).render(cesta=cesta, **kw)
        cil = os.path.join(DIST, cesta, "index.html") if cesta else os.path.join(DIST, "index.html")
        os.makedirs(os.path.dirname(cil), exist_ok=True)
        with open(cil, "w", encoding="utf-8") as fh:
            fh.write(kod)
        stranky.append(cesta)

    U = texty["uvod"]
    render("index.html", "", titulek=U["title"], popis=U["description"], og=og_uvod)
    for sablona, cesta, klic in (("o-nas.html", "o-nas/", "o_nas"), ("privatni-cesty.html", "privatni-cesty/", "privatni"),
                                 ("pro-influencery.html", "pro-influencery/", "influenceri")):
        render(sablona, cesta, titulek=texty[klic]["title"], popis=texty[klic]["description"], og=og_uvod)
    for e in vid:
        og = obr.og(e["foto"]["src"], f"expedice/{e['slug']}/og.jpg") if e.get("foto", {}).get("src") else og_uvod
        dalsi = [x for x in budouci if x["slug"] != e["slug"]][:3]
        render("expedice.html", f"expedice/{e['slug']}/", e=e, dalsi=dalsi,
               titulek=f"{e['nazev']} – {termin(e)} | {site['nazev']}",
               popis=(e.get("perex") or "")[:155].rsplit(" ", 1)[0] + "…" if len(e.get("perex") or "") > 158 else (e.get("perex") or site["popis"]),
               og=og)
    obr.reset()
    with open(os.path.join(DIST, "404.html"), "w", encoding="utf-8") as fh:
        fh.write(env.get_template("404.html").render(cesta="404.html", titulek="Stránka nenalezena | " + site["nazev"], popis="", og=og_uvod))

    # administrace (cache busting jako na webu) + seznam fotek pro výběr
    adm = os.path.join(ROOT, "admin")
    if os.path.isdir(adm):
        shutil.copytree(adm, os.path.join(DIST, "admin"))
        p = os.path.join(DIST, "admin", "index.html")
        s = open(p, encoding="utf-8").read()
        s = s.replace("__V_ACSS__", hash_souboru(os.path.join(adm, "admin.css"))).replace("__V_AJS__", hash_souboru(os.path.join(adm, "admin.js")))
        open(p, "w", encoding="utf-8").write(s)
        imgs = sorted(os.path.relpath(os.path.join(d, f), ROOT) for d, _, fs in os.walk(os.path.join(ROOT, "img"))
                      for f in fs if f.lower().endswith((".webp", ".jpg", ".jpeg", ".png")))
        json.dump(imgs, open(os.path.join(DIST, "admin", "images.json"), "w"), ensure_ascii=False)

    # robots, sitemap, llms, CNAME, version
    with open(os.path.join(DIST, "robots.txt"), "w") as fh:
        fh.write(f"User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: {url_webu}sitemap.xml\n" if ostry else "User-agent: *\nDisallow: /\n")
    with open(os.path.join(DIST, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for s in stranky:
            fh.write(f"  <url><loc>{url_webu}{s}</loc><lastmod>{dnes.isoformat()}</lastmod></url>\n")
        fh.write("</urlset>\n")
    with open(os.path.join(DIST, "llms.txt"), "w", encoding="utf-8") as fh:
        fh.write(f"# {site['nazev']}\n\n> {site['popis']}\n\n## Nadcházející expedice\n")
        for e in budouci:
            fh.write(f"- {e['nazev']} ({termin(e)}, {e['lokace']}, {e['cena']}): {url_webu}expedice/{e['slug']}/\n")
        fh.write(f"\n## Kontakt\n- E-mail: {site.get('email', '')}\n")
    open(os.path.join(DIST, ".nojekyll"), "w").close()
    if ostry:
        open(os.path.join(DIST, "CNAME"), "w").write(domena + "\n")
    json.dump({"sha": os.environ.get("GITHUB_SHA", "local"), "built": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")},
              open(os.path.join(DIST, "version.json"), "w"))
    print(f"OK: {len(stranky)} stránek ({len(budouci)} nadcházejících expedic, {len(probehle)} proběhlých), "
          f"{len(obr.hotovo)} fotek -> dist/ ({'OSTRÝ WEB ' + domena if ostry else 'NÁVRH, noindex'})")


if __name__ == "__main__":
    try:
        main()
    except BuildError as e:
        sys.exit(f"CHYBA buildu: {e}")
    if "--serve" in sys.argv:
        import http.server
        import socketserver
        base = json.load(open(os.path.join(DATA, "site.json")))["base"]
        tmp = os.path.join(ROOT, ".cache", "serve")
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(os.path.dirname(os.path.join(tmp, base.strip("/"))), exist_ok=True)
        shutil.copytree(DIST, os.path.join(tmp, base.strip("/")))
        os.chdir(tmp)
        print(f"http://localhost:8765{base}")
        socketserver.TCPServer.allow_reuse_address = True
        socketserver.TCPServer(("", 8765), http.server.SimpleHTTPRequestHandler).serve_forever()
