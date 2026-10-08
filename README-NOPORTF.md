# Versija "noportf" (bez GPS, bez portu pāradresācijas)

Šī zara paredzēta situācijai, kad **nevar atvērt portus** un nav tunela vai domēna. Spēle strādā kā parasta mājaslapa uz **8080. porta** tavā mājas tīklā.

* Adrese: `http://<Pi IP>:8080`, piemēram `http://192.168.101.67:8080`. Visiem jābūt vienā Wi-Fi tīklā.
* **Nav GPS.** Augšā labajā pusē nospied **Norādīt vietu** un pieskaries kartē tur, kur esi. Atkārto, kad pārvietojies. Slēpējs un meklētāji to dara, lai serveris varētu aprēķināt atbildes (Hide & Seek), Tag un Race arī rāda šīs vietas.
* Paziņojumi ar aizvērtu lapu šajā versijā nestrādā (vajag HTTPS).

## Uzstādīšana uz Pi

```bash
cd ~/Jet-Lag-Latvia && git fetch && git checkout noportf && git pull
sudo cp deploy/jetlag.service /etc/systemd/system/jetlag.service
sudo systemctl daemon-reload && sudo systemctl restart jetlag && systemctl is-active jetlag
```

Pārbaude: atver `http://192.168.101.67:8080` telefonā, kas ir tajā pašā tīklā.
