"""Writes server/geodata/cities.json. Coordinates are approximate town centres (fine for game use)."""
import json, os, re, unicodedata
R = 'Riga Daugavpils Liepāja Jelgava Jūrmala Ventspils Rēzekne Jēkabpils Valmiera'.split()  # the 9 republican cities
C = """Rīga|56.9496|24.1052|600
Daugavpils|55.8747|26.5362|80
Liepāja|56.5047|21.0108|65
Jelgava|56.6511|23.7214|55
Jūrmala|56.9680|23.7704|50
Ventspils|57.3894|21.5606|33
Rēzekne|56.5099|27.3331|27
Valmiera|57.5384|25.4264|22
Jēkabpils|56.4992|25.8578|21
Ogre|56.8156|24.6042|24
Tukums|56.9672|23.1553|17
Cēsis|57.3119|25.2747|15
Salaspils|56.8603|24.3497|16
Kuldīga|56.9687|21.9706|10
Olaine|56.7869|23.9397|10
Saldus|56.6642|22.4878|10
Talsi|57.2447|22.5881|9
Sigulda|57.1537|24.8531|10
Bauska|56.4086|24.1928|9
Dobele|56.6258|23.2788|9
Limbaži|57.5131|24.7131|7
Smiltene|57.4236|25.9006|5
Madona|56.8526|26.2217|7
Aizkraukle|56.6047|25.2553|7
Gulbene|57.1756|26.7519|7
Balvi|57.1309|27.2647|6
Ludza|56.5463|27.7226|7
Preiļi|56.2930|26.7270|6
Krāslava|55.8953|27.1665|7
Alūksne|57.4229|27.0469|7
Valka|57.7750|26.0178|5
Saulkrasti|57.2640|24.4140|3
Ķekava|56.8294|24.2305|8
Līvāni|56.3542|26.1750|7
Lielvārde|56.7228|24.8148|5
Kandava|57.0333|22.7800|4
Aizpute|56.7200|21.6050|4
Grobiņa|56.5358|21.1653|4
Pāvilosta|56.8894|21.1928|1
Dundaga|57.5069|22.3500|1
Rūjiena|57.9022|25.3356|3
Ainaži|57.8667|24.3631|1
Salacgrīva|57.7544|24.3544|3
Zilupe|56.3856|28.1236|2
Viļaka|57.1800|27.6700|1
Sabile|57.0500|22.5700|1
Stende|57.1500|22.5333|1
Skrunda|56.6750|22.0167|2
Ilūkste|55.9778|26.2928|2
Kārsava|56.7764|27.6725|2
Cesvaine|56.9678|26.3072|1
Varakļāni|56.6075|26.7542|2
Ape|57.5403|26.6969|1
Mazsalaca|57.8583|25.0500|1
Strenči|57.6253|25.6750|1
Pļaviņas|56.6167|25.7167|3
Koknese|56.6467|25.4400|3
Ikšķile|56.8333|24.4833|4
Baldone|56.7433|24.3933|3
Iecava|56.6000|24.2000|5
Vecumnieki|56.6047|24.5200|2
Ērgļi|56.9083|25.6333|2
Jaunjelgava|56.6131|25.0783|2
Viesīte|56.3453|25.5639|2
Auce|56.4614|22.9000|3
Brocēni|56.6800|22.5633|3
Priekule|56.4500|21.5983|2
Durbe|56.5856|21.3636|1
Nīca|56.3342|21.0658|1
Rucava|56.1597|21.1544|1
Vaiņode|56.4197|21.8536|1
Roja|57.5047|22.8033|2
Mērsrags|57.3333|23.1333|1
Carnikava|57.1300|24.2800|2
Inčukalns|57.0958|24.6989|2
Mārupe|56.9061|24.0478|10
Ādaži|57.0750|24.3250|7
Ropaži|56.9700|24.6300|2
Lubāna|56.9000|26.7200|2
Dagda|56.0950|27.5300|2
Subate|56.0000|25.9200|1
Piltene|57.2250|21.6750|1
Kalnciems|56.7800|23.6300|1
Jaunpils|56.7300|23.0200|1
Pope|57.3400|21.8400|1""".split('\n')
def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()).strip('-')
out = []
for line in C:
    n, la, lo, pop = line.split('|')
    out.append({'id': slug(n), 'name': n, 'lat': float(la), 'lng': float(lo), 'pop': int(pop), 'republic': n in R or (n == 'Rīga')})
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server', 'geodata', 'cities.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(out), sum(c['republic'] for c in out))
