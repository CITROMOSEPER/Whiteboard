/* Interface languages. WB.t(key, vars) returns the string for the active language
   (falling back to English); WB.setLang(code) switches it. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});

  /* [code, name in its own language, name in English] — sorted by the English name. */
  WB.LANGS = [
    ['ar', 'العربية', 'Arabic'],
    ['zh', '中文（普通话）', 'Chinese (Mandarin)'],
    ['en', 'English', 'English'],
    ['fr', 'Français', 'French'],
    ['de', 'Deutsch', 'German'],
    ['hi', 'हिन्दी', 'Hindi'],
    ['hu', 'Magyar', 'Hungarian'],
    ['it', 'Italiano', 'Italian'],
    ['ja', '日本語', 'Japanese'],
    ['pt', 'Português', 'Portuguese'],
    ['ru', 'Русский', 'Russian'],
    ['es', 'Español', 'Spanish'],
    ['tr', 'Türkçe', 'Turkish'],
    ['uk', 'Українська', 'Ukrainian'],
  ];

  const D = {};

  D.en = {
    untitled: 'Untitled',
    hint1: 'Draw anywhere. Pinch or scroll to move around.',
    hint2: 'Hold still at the end of a stroke to snap it into a clean shape.',
    hint3: 'Drag a color out of the dock into a closed shape to fill it.',
    menu: 'Menu', boardName: 'Board name', undo: 'Undo', redo: 'Redo', zoom: 'Zoom', thickness: 'Thickness', opacity: 'Opacity',
    pen: 'Pen', eraser: 'Eraser', text: 'Text', select: 'Select', move: 'Move', customColor: 'Custom color',
    mNew: 'New board', mOpen: 'Open…', mSave: 'Save', mExport: 'Export…', mClear: 'Clear board', mSettings: 'Settings…',
    zIn: 'Zoom in', zOut: 'Zoom out', zActual: 'Actual size', zFit: 'Fit to content',
    settings: 'Settings', done: 'Done', appearance: 'Appearance', theme: 'Theme', light: 'Light', dark: 'Dark', system: 'System',
    canvasColor: 'Canvas color', custom: 'Custom',
    drawing: 'Drawing', smoothing: 'Stroke smoothing', off: 'Off', smoothingNote: 'Off keeps every stroke exactly as you drew it.',
    snap: 'Hold to snap shapes', snapNote: 'Pause at the end of a stroke and it becomes a clean shape.',
    snapDelay: 'Snap delay', snapDelayNote: 'Seconds to hold still before a stroke snaps.',
    finger: 'Draw with finger', fingerNote: 'Turn off to draw with a stylus only; one finger then moves the board.',
    handwriting: 'Handwriting', ink: 'Convert handwriting to text', inkNote: 'Letters, digits and math symbols you write turn into typed text.',
    inkDelay: 'Conversion delay', inkDelayNote: 'Seconds after you stop writing.', alphabet: 'Alphabet', latin: 'Latin', cyrillic: 'Cyrillic',
    canvas: 'Canvas', plain: 'Plain', dots: 'Dots', grid: 'Grid', language: 'Language',
    export: 'Export', cancel: 'Cancel', format: 'Format', resolution: 'Resolution', background: 'Background', board: 'Board', white: 'White', transparent: 'Transparent', exporting: 'Exporting…',
    nPng: 'Lossless. Keeps a transparent background.', nJpeg: 'Small files. No transparency.', nWebp: 'Smaller than PNG. Keeps a transparent background.',
    nBmp: 'Uncompressed. No transparency.', nSvg: 'Vector. Stays sharp at any size and remains editable.', nPdf: 'Vector. Best for printing and sharing.',
    selected: '{n} selected', delete: 'Delete', deleted: 'Deleted',
    sLine: 'Line', sPolyline: 'Polyline', sCurve: 'Curve', sTriangle: 'Triangle', sRectangle: 'Rectangle', sSquare: 'Square', sQuad: 'Quadrilateral', sPentagon: 'Pentagon', sHexagon: 'Hexagon', sCircle: 'Circle', sEllipse: 'Ellipse',
    tNoShape: 'No closed shape to fill there', tCleared: 'Board cleared', tOpened: 'Opened “{t}”', tSaved: 'Saved', tSavedDl: 'Saved to Downloads',
    tNothing: 'Nothing to export yet', tExported: 'Exported {t}', tLowRes: 'Exported at a lower resolution to fit', tExportFail: 'Export failed',
    eInvalid: 'This file is not valid WHTBD.', eNotBoard: 'This file is not a whiteboard.', eNewer: 'This board was made with a newer version.',
    fSans: 'Sans', fSerif: 'Serif', fMono: 'Mono', fRounded: 'Rounded', fHand: 'Handwritten',
    font: 'Font', smaller: 'Smaller text', larger: 'Larger text', textColor: 'Text color', pickColor: 'Pick a color from the board', colorFormat: 'Change color format',
  };

  D.hu = {
    untitled: 'Névtelen',
    hint1: 'Rajzolj bárhová. Csípéssel vagy görgetéssel mozoghatsz.',
    hint2: 'A vonás végén tartsd egy helyben a tollat, és a rajz szabályos alakzattá igazodik.',
    hint3: 'Húzz egy színt a dokkból egy zárt alakzatba a kitöltéshez.',
    menu: 'Menü', boardName: 'Tábla neve', undo: 'Visszavonás', redo: 'Újra', zoom: 'Nagyítás', thickness: 'Vastagság', opacity: 'Átlátszatlanság',
    pen: 'Toll', eraser: 'Radír', text: 'Szöveg', select: 'Kijelölés', move: 'Mozgatás', customColor: 'Egyéni szín',
    mNew: 'Új tábla', mOpen: 'Megnyitás…', mSave: 'Mentés', mExport: 'Exportálás…', mClear: 'Tábla törlése', mSettings: 'Beállítások…',
    zIn: 'Nagyítás', zOut: 'Kicsinyítés', zActual: 'Valódi méret', zFit: 'Tartalomhoz igazítás',
    settings: 'Beállítások', done: 'Kész', appearance: 'Megjelenés', theme: 'Téma', light: 'Világos', dark: 'Sötét', system: 'Rendszer',
    canvasColor: 'Vászon színe', custom: 'Egyéni',
    drawing: 'Rajzolás', smoothing: 'Vonalsimítás', off: 'Ki', smoothingNote: 'Kikapcsolva minden vonás pontosan úgy marad, ahogy rajzoltad.',
    snap: 'Alakzatigazítás tartással', snapNote: 'Állj meg a vonás végén, és szabályos alakzat lesz belőle.',
    snapDelay: 'Igazítás késleltetése', snapDelayNote: 'Ennyi másodpercig kell egy helyben tartani a tollat.',
    finger: 'Rajzolás ujjal', fingerNote: 'Kikapcsolva csak tollal lehet rajzolni; egy ujj ekkor a táblát mozgatja.',
    handwriting: 'Kézírás', ink: 'Kézírás szöveggé alakítása', inkNote: 'A leírt betűk, számok és matematikai jelek gépelt szöveggé alakulnak.',
    inkDelay: 'Átalakítás késleltetése', inkDelayNote: 'Másodperc az írás befejezése után.', alphabet: 'Ábécé', latin: 'Latin', cyrillic: 'Cirill',
    canvas: 'Vászon', plain: 'Sima', dots: 'Pontok', grid: 'Rács', language: 'Nyelv',
    export: 'Exportálás', cancel: 'Mégse', format: 'Formátum', resolution: 'Felbontás', background: 'Háttér', board: 'Tábla', white: 'Fehér', transparent: 'Átlátszó', exporting: 'Exportálás…',
    nPng: 'Veszteségmentes. Megtartja az átlátszó hátteret.', nJpeg: 'Kis fájlméret. Nincs átlátszóság.', nWebp: 'Kisebb, mint a PNG. Megtartja az átlátszó hátteret.',
    nBmp: 'Tömörítetlen. Nincs átlátszóság.', nSvg: 'Vektoros. Bármilyen méretben éles és szerkeszthető marad.', nPdf: 'Vektoros. Nyomtatáshoz és megosztáshoz a legjobb.',
    selected: '{n} kijelölve', delete: 'Törlés', deleted: 'Törölve',
    sLine: 'Vonal', sPolyline: 'Töröttvonal', sCurve: 'Görbe', sTriangle: 'Háromszög', sRectangle: 'Téglalap', sSquare: 'Négyzet', sQuad: 'Négyszög', sPentagon: 'Ötszög', sHexagon: 'Hatszög', sCircle: 'Kör', sEllipse: 'Ellipszis',
    tNoShape: 'Itt nincs kitölthető zárt alakzat', tCleared: 'Tábla törölve', tOpened: 'Megnyitva: „{t}”', tSaved: 'Mentve', tSavedDl: 'Mentve a Letöltések mappába',
    tNothing: 'Még nincs mit exportálni', tExported: 'Exportálva: {t}', tLowRes: 'Kisebb felbontásban exportálva, hogy elférjen', tExportFail: 'Az exportálás nem sikerült',
    eInvalid: 'Ez a fájl nem érvényes WHTBD.', eNotBoard: 'Ez a fájl nem tábla.', eNewer: 'Ez a tábla újabb verzióval készült.',
    fSans: 'Talpatlan', fSerif: 'Talpas', fMono: 'Írógép', fRounded: 'Lekerekített', fHand: 'Kézírásos',
    font: 'Betűtípus', smaller: 'Kisebb szöveg', larger: 'Nagyobb szöveg', textColor: 'Szöveg színe', pickColor: 'Szín felvétele a tábláról', colorFormat: 'Színformátum váltása',
  };

  D.de = {
    untitled: 'Unbenannt',
    hint1: 'Zeichne irgendwo. Mit zwei Fingern oder dem Mausrad bewegst du dich.',
    hint2: 'Halte am Ende eines Strichs still, damit er zu einer sauberen Form wird.',
    hint3: 'Ziehe eine Farbe aus der Leiste in eine geschlossene Form, um sie zu füllen.',
    menu: 'Menü', boardName: 'Name der Tafel', undo: 'Rückgängig', redo: 'Wiederholen', zoom: 'Zoom', thickness: 'Stärke', opacity: 'Deckkraft',
    pen: 'Stift', eraser: 'Radierer', text: 'Text', select: 'Auswählen', move: 'Bewegen', customColor: 'Eigene Farbe',
    mNew: 'Neue Tafel', mOpen: 'Öffnen…', mSave: 'Speichern', mExport: 'Exportieren…', mClear: 'Tafel leeren', mSettings: 'Einstellungen…',
    zIn: 'Vergrößern', zOut: 'Verkleinern', zActual: 'Originalgröße', zFit: 'An Inhalt anpassen',
    settings: 'Einstellungen', done: 'Fertig', appearance: 'Darstellung', theme: 'Design', light: 'Hell', dark: 'Dunkel', system: 'System',
    canvasColor: 'Farbe der Fläche', custom: 'Eigene',
    drawing: 'Zeichnen', smoothing: 'Strichglättung', off: 'Aus', smoothingNote: 'Aus: Jeder Strich bleibt genau so, wie du ihn gezeichnet hast.',
    snap: 'Formen durch Halten einrasten', snapNote: 'Halte am Ende eines Strichs inne und er wird zu einer sauberen Form.',
    snapDelay: 'Einrastverzögerung', snapDelayNote: 'Sekunden, die der Stift still gehalten werden muss.',
    finger: 'Mit dem Finger zeichnen', fingerNote: 'Aus: Es wird nur mit dem Stift gezeichnet; ein Finger bewegt dann die Tafel.',
    handwriting: 'Handschrift', ink: 'Handschrift in Text umwandeln', inkNote: 'Geschriebene Buchstaben, Ziffern und mathematische Zeichen werden zu getipptem Text.',
    inkDelay: 'Umwandlungsverzögerung', inkDelayNote: 'Sekunden nach dem Ende des Schreibens.', alphabet: 'Alphabet', latin: 'Lateinisch', cyrillic: 'Kyrillisch',
    canvas: 'Fläche', plain: 'Leer', dots: 'Punkte', grid: 'Raster', language: 'Sprache',
    export: 'Exportieren', cancel: 'Abbrechen', format: 'Format', resolution: 'Auflösung', background: 'Hintergrund', board: 'Tafel', white: 'Weiß', transparent: 'Transparent', exporting: 'Exportiere…',
    nPng: 'Verlustfrei. Behält einen transparenten Hintergrund.', nJpeg: 'Kleine Dateien. Keine Transparenz.', nWebp: 'Kleiner als PNG. Behält einen transparenten Hintergrund.',
    nBmp: 'Unkomprimiert. Keine Transparenz.', nSvg: 'Vektor. Bleibt in jeder Größe scharf und bearbeitbar.', nPdf: 'Vektor. Am besten zum Drucken und Teilen.',
    selected: '{n} ausgewählt', delete: 'Löschen', deleted: 'Gelöscht',
    sLine: 'Linie', sPolyline: 'Linienzug', sCurve: 'Kurve', sTriangle: 'Dreieck', sRectangle: 'Rechteck', sSquare: 'Quadrat', sQuad: 'Viereck', sPentagon: 'Fünfeck', sHexagon: 'Sechseck', sCircle: 'Kreis', sEllipse: 'Ellipse',
    tNoShape: 'Hier ist keine geschlossene Form zum Füllen', tCleared: 'Tafel geleert', tOpened: '„{t}“ geöffnet', tSaved: 'Gespeichert', tSavedDl: 'In „Downloads“ gespeichert',
    tNothing: 'Noch nichts zu exportieren', tExported: '{t} exportiert', tLowRes: 'Mit geringerer Auflösung exportiert, damit es passt', tExportFail: 'Export fehlgeschlagen',
    eInvalid: 'Diese Datei ist kein gültiges WHTBD.', eNotBoard: 'Diese Datei ist keine Tafel.', eNewer: 'Diese Tafel wurde mit einer neueren Version erstellt.',
    fSans: 'Serifenlos', fSerif: 'Serif', fMono: 'Mono', fRounded: 'Rund', fHand: 'Handschrift',
    font: 'Schrift', smaller: 'Text kleiner', larger: 'Text größer', textColor: 'Textfarbe', pickColor: 'Farbe von der Tafel aufnehmen', colorFormat: 'Farbformat wechseln',
  };

  D.fr = {
    untitled: 'Sans titre',
    hint1: 'Dessinez n’importe où. Pincez ou faites défiler pour vous déplacer.',
    hint2: 'Restez immobile à la fin d’un trait pour le transformer en forme nette.',
    hint3: 'Faites glisser une couleur du dock dans une forme fermée pour la remplir.',
    menu: 'Menu', boardName: 'Nom du tableau', undo: 'Annuler', redo: 'Rétablir', zoom: 'Zoom', thickness: 'Épaisseur', opacity: 'Opacité',
    pen: 'Stylo', eraser: 'Gomme', text: 'Texte', select: 'Sélection', move: 'Déplacer', customColor: 'Couleur personnalisée',
    mNew: 'Nouveau tableau', mOpen: 'Ouvrir…', mSave: 'Enregistrer', mExport: 'Exporter…', mClear: 'Effacer le tableau', mSettings: 'Réglages…',
    zIn: 'Zoom avant', zOut: 'Zoom arrière', zActual: 'Taille réelle', zFit: 'Ajuster au contenu',
    settings: 'Réglages', done: 'OK', appearance: 'Apparence', theme: 'Thème', light: 'Clair', dark: 'Sombre', system: 'Système',
    canvasColor: 'Couleur du fond', custom: 'Personnalisée',
    drawing: 'Dessin', smoothing: 'Lissage du trait', off: 'Désactivé', smoothingNote: 'Désactivé : chaque trait reste exactement tel que vous l’avez tracé.',
    snap: 'Maintenir pour ajuster les formes', snapNote: 'Faites une pause à la fin d’un trait et il devient une forme nette.',
    snapDelay: 'Délai d’ajustement', snapDelayNote: 'Secondes d’immobilité avant l’ajustement du trait.',
    finger: 'Dessiner au doigt', fingerNote: 'Désactivé : seul le stylet dessine ; un doigt déplace alors le tableau.',
    handwriting: 'Écriture manuscrite', ink: 'Convertir l’écriture en texte', inkNote: 'Les lettres, chiffres et symboles mathématiques écrits deviennent du texte saisi.',
    inkDelay: 'Délai de conversion', inkDelayNote: 'Secondes après la fin de l’écriture.', alphabet: 'Alphabet', latin: 'Latin', cyrillic: 'Cyrillique',
    canvas: 'Fond', plain: 'Uni', dots: 'Points', grid: 'Grille', language: 'Langue',
    export: 'Exporter', cancel: 'Annuler', format: 'Format', resolution: 'Résolution', background: 'Arrière-plan', board: 'Tableau', white: 'Blanc', transparent: 'Transparent', exporting: 'Exportation…',
    nPng: 'Sans perte. Conserve un fond transparent.', nJpeg: 'Fichiers légers. Pas de transparence.', nWebp: 'Plus léger que le PNG. Conserve un fond transparent.',
    nBmp: 'Non compressé. Pas de transparence.', nSvg: 'Vectoriel. Reste net à toute taille et modifiable.', nPdf: 'Vectoriel. Idéal pour imprimer et partager.',
    selected: '{n} sélectionné(s)', delete: 'Supprimer', deleted: 'Supprimé',
    sLine: 'Ligne', sPolyline: 'Ligne brisée', sCurve: 'Courbe', sTriangle: 'Triangle', sRectangle: 'Rectangle', sSquare: 'Carré', sQuad: 'Quadrilatère', sPentagon: 'Pentagone', sHexagon: 'Hexagone', sCircle: 'Cercle', sEllipse: 'Ellipse',
    tNoShape: 'Aucune forme fermée à remplir ici', tCleared: 'Tableau effacé', tOpened: '« {t} » ouvert', tSaved: 'Enregistré', tSavedDl: 'Enregistré dans Téléchargements',
    tNothing: 'Rien à exporter pour l’instant', tExported: '{t} exporté', tLowRes: 'Exporté à une résolution réduite pour tenir', tExportFail: 'Échec de l’exportation',
    eInvalid: 'Ce fichier n’est pas un WHTBD valide.', eNotBoard: 'Ce fichier n’est pas un tableau.', eNewer: 'Ce tableau a été créé avec une version plus récente.',
    fSans: 'Sans empattement', fSerif: 'Empattement', fMono: 'Mono', fRounded: 'Arrondie', fHand: 'Manuscrite',
    font: 'Police', smaller: 'Texte plus petit', larger: 'Texte plus grand', textColor: 'Couleur du texte', pickColor: 'Prélever une couleur sur le tableau', colorFormat: 'Changer de format de couleur',
  };

  D.it = {
    untitled: 'Senza titolo',
    hint1: 'Disegna ovunque. Pizzica o scorri per spostarti.',
    hint2: 'Resta fermo alla fine di un tratto per trasformarlo in una forma pulita.',
    hint3: 'Trascina un colore dal dock in una forma chiusa per riempirla.',
    menu: 'Menu', boardName: 'Nome della lavagna', undo: 'Annulla', redo: 'Ripristina', zoom: 'Zoom', thickness: 'Spessore', opacity: 'Opacità',
    pen: 'Penna', eraser: 'Gomma', text: 'Testo', select: 'Selezione', move: 'Sposta', customColor: 'Colore personalizzato',
    mNew: 'Nuova lavagna', mOpen: 'Apri…', mSave: 'Salva', mExport: 'Esporta…', mClear: 'Cancella lavagna', mSettings: 'Impostazioni…',
    zIn: 'Ingrandisci', zOut: 'Riduci', zActual: 'Dimensione reale', zFit: 'Adatta al contenuto',
    settings: 'Impostazioni', done: 'Fine', appearance: 'Aspetto', theme: 'Tema', light: 'Chiaro', dark: 'Scuro', system: 'Sistema',
    canvasColor: 'Colore dello sfondo', custom: 'Personalizzato',
    drawing: 'Disegno', smoothing: 'Levigatura del tratto', off: 'No', smoothingNote: 'Disattivata: ogni tratto resta esattamente come l’hai disegnato.',
    snap: 'Tieni fermo per regolare le forme', snapNote: 'Fermati alla fine di un tratto e diventerà una forma pulita.',
    snapDelay: 'Ritardo di regolazione', snapDelayNote: 'Secondi di immobilità prima che il tratto si regoli.',
    finger: 'Disegna con il dito', fingerNote: 'Disattivato: si disegna solo con lo stilo; un dito sposta la lavagna.',
    handwriting: 'Scrittura a mano', ink: 'Converti la scrittura in testo', inkNote: 'Lettere, cifre e simboli matematici scritti diventano testo digitato.',
    inkDelay: 'Ritardo di conversione', inkDelayNote: 'Secondi dopo aver smesso di scrivere.', alphabet: 'Alfabeto', latin: 'Latino', cyrillic: 'Cirillico',
    canvas: 'Sfondo', plain: 'Semplice', dots: 'Punti', grid: 'Griglia', language: 'Lingua',
    export: 'Esporta', cancel: 'Annulla', format: 'Formato', resolution: 'Risoluzione', background: 'Sfondo', board: 'Lavagna', white: 'Bianco', transparent: 'Trasparente', exporting: 'Esportazione…',
    nPng: 'Senza perdita. Mantiene lo sfondo trasparente.', nJpeg: 'File piccoli. Nessuna trasparenza.', nWebp: 'Più piccolo del PNG. Mantiene lo sfondo trasparente.',
    nBmp: 'Non compresso. Nessuna trasparenza.', nSvg: 'Vettoriale. Nitido a ogni dimensione e modificabile.', nPdf: 'Vettoriale. Ideale per stampare e condividere.',
    selected: '{n} selezionati', delete: 'Elimina', deleted: 'Eliminato',
    sLine: 'Linea', sPolyline: 'Spezzata', sCurve: 'Curva', sTriangle: 'Triangolo', sRectangle: 'Rettangolo', sSquare: 'Quadrato', sQuad: 'Quadrilatero', sPentagon: 'Pentagono', sHexagon: 'Esagono', sCircle: 'Cerchio', sEllipse: 'Ellisse',
    tNoShape: 'Qui non c’è una forma chiusa da riempire', tCleared: 'Lavagna cancellata', tOpened: '“{t}” aperta', tSaved: 'Salvato', tSavedDl: 'Salvato in Download',
    tNothing: 'Ancora niente da esportare', tExported: '{t} esportato', tLowRes: 'Esportato a risoluzione inferiore per rientrare nei limiti', tExportFail: 'Esportazione non riuscita',
    eInvalid: 'Questo file non è un WHTBD valido.', eNotBoard: 'Questo file non è una lavagna.', eNewer: 'Questa lavagna è stata creata con una versione più recente.',
    fSans: 'Senza grazie', fSerif: 'Con grazie', fMono: 'Mono', fRounded: 'Arrotondato', fHand: 'Manoscritto',
    font: 'Carattere', smaller: 'Testo più piccolo', larger: 'Testo più grande', textColor: 'Colore del testo', pickColor: 'Preleva un colore dalla lavagna', colorFormat: 'Cambia formato colore',
  };

  D.es = {
    untitled: 'Sin título',
    hint1: 'Dibuja donde quieras. Pellizca o desplázate para moverte.',
    hint2: 'Quédate quieto al final de un trazo para convertirlo en una forma limpia.',
    hint3: 'Arrastra un color del dock a una forma cerrada para rellenarla.',
    menu: 'Menú', boardName: 'Nombre de la pizarra', undo: 'Deshacer', redo: 'Rehacer', zoom: 'Zoom', thickness: 'Grosor', opacity: 'Opacidad',
    pen: 'Lápiz', eraser: 'Borrador', text: 'Texto', select: 'Seleccionar', move: 'Mover', customColor: 'Color personalizado',
    mNew: 'Nueva pizarra', mOpen: 'Abrir…', mSave: 'Guardar', mExport: 'Exportar…', mClear: 'Borrar pizarra', mSettings: 'Ajustes…',
    zIn: 'Acercar', zOut: 'Alejar', zActual: 'Tamaño real', zFit: 'Ajustar al contenido',
    settings: 'Ajustes', done: 'Listo', appearance: 'Apariencia', theme: 'Tema', light: 'Claro', dark: 'Oscuro', system: 'Sistema',
    canvasColor: 'Color del lienzo', custom: 'Personalizado',
    drawing: 'Dibujo', smoothing: 'Suavizado del trazo', off: 'No', smoothingNote: 'Desactivado: cada trazo queda exactamente como lo dibujaste.',
    snap: 'Mantener para ajustar formas', snapNote: 'Haz una pausa al final de un trazo y se convertirá en una forma limpia.',
    snapDelay: 'Retardo de ajuste', snapDelayNote: 'Segundos sin moverse antes de que el trazo se ajuste.',
    finger: 'Dibujar con el dedo', fingerNote: 'Desactivado: solo se dibuja con el lápiz óptico; un dedo mueve la pizarra.',
    handwriting: 'Escritura a mano', ink: 'Convertir escritura en texto', inkNote: 'Las letras, cifras y símbolos matemáticos que escribas se convierten en texto.',
    inkDelay: 'Retardo de conversión', inkDelayNote: 'Segundos después de dejar de escribir.', alphabet: 'Alfabeto', latin: 'Latino', cyrillic: 'Cirílico',
    canvas: 'Lienzo', plain: 'Liso', dots: 'Puntos', grid: 'Cuadrícula', language: 'Idioma',
    export: 'Exportar', cancel: 'Cancelar', format: 'Formato', resolution: 'Resolución', background: 'Fondo', board: 'Pizarra', white: 'Blanco', transparent: 'Transparente', exporting: 'Exportando…',
    nPng: 'Sin pérdida. Conserva el fondo transparente.', nJpeg: 'Archivos pequeños. Sin transparencia.', nWebp: 'Más pequeño que PNG. Conserva el fondo transparente.',
    nBmp: 'Sin comprimir. Sin transparencia.', nSvg: 'Vectorial. Nítido a cualquier tamaño y editable.', nPdf: 'Vectorial. Ideal para imprimir y compartir.',
    selected: '{n} seleccionados', delete: 'Eliminar', deleted: 'Eliminado',
    sLine: 'Línea', sPolyline: 'Línea quebrada', sCurve: 'Curva', sTriangle: 'Triángulo', sRectangle: 'Rectángulo', sSquare: 'Cuadrado', sQuad: 'Cuadrilátero', sPentagon: 'Pentágono', sHexagon: 'Hexágono', sCircle: 'Círculo', sEllipse: 'Elipse',
    tNoShape: 'Aquí no hay una forma cerrada que rellenar', tCleared: 'Pizarra borrada', tOpened: 'Se abrió «{t}»', tSaved: 'Guardado', tSavedDl: 'Guardado en Descargas',
    tNothing: 'Todavía no hay nada que exportar', tExported: '{t} exportado', tLowRes: 'Exportado a menor resolución para que quepa', tExportFail: 'Error al exportar',
    eInvalid: 'Este archivo no es un WHTBD válido.', eNotBoard: 'Este archivo no es una pizarra.', eNewer: 'Esta pizarra se creó con una versión más reciente.',
    fSans: 'Sin serifa', fSerif: 'Con serifa', fMono: 'Mono', fRounded: 'Redondeada', fHand: 'Manuscrita',
    font: 'Tipo de letra', smaller: 'Texto más pequeño', larger: 'Texto más grande', textColor: 'Color del texto', pickColor: 'Tomar un color de la pizarra', colorFormat: 'Cambiar formato de color',
  };

  D.pt = {
    untitled: 'Sem título',
    hint1: 'Desenhe em qualquer lugar. Belisque ou role para se mover.',
    hint2: 'Fique parado no fim de um traço para transformá-lo numa forma limpa.',
    hint3: 'Arraste uma cor da barra para dentro de uma forma fechada para preenchê-la.',
    menu: 'Menu', boardName: 'Nome do quadro', undo: 'Desfazer', redo: 'Refazer', zoom: 'Zoom', thickness: 'Espessura', opacity: 'Opacidade',
    pen: 'Caneta', eraser: 'Borracha', text: 'Texto', select: 'Selecionar', move: 'Mover', customColor: 'Cor personalizada',
    mNew: 'Novo quadro', mOpen: 'Abrir…', mSave: 'Salvar', mExport: 'Exportar…', mClear: 'Limpar quadro', mSettings: 'Ajustes…',
    zIn: 'Ampliar', zOut: 'Reduzir', zActual: 'Tamanho real', zFit: 'Ajustar ao conteúdo',
    settings: 'Ajustes', done: 'Concluído', appearance: 'Aparência', theme: 'Tema', light: 'Claro', dark: 'Escuro', system: 'Sistema',
    canvasColor: 'Cor da tela', custom: 'Personalizada',
    drawing: 'Desenho', smoothing: 'Suavização do traço', off: 'Não', smoothingNote: 'Desativada: cada traço fica exatamente como você desenhou.',
    snap: 'Segurar para ajustar formas', snapNote: 'Faça uma pausa no fim de um traço e ele vira uma forma limpa.',
    snapDelay: 'Atraso do ajuste', snapDelayNote: 'Segundos parado antes de o traço se ajustar.',
    finger: 'Desenhar com o dedo', fingerNote: 'Desativado: só a caneta desenha; um dedo move o quadro.',
    handwriting: 'Escrita à mão', ink: 'Converter escrita em texto', inkNote: 'Letras, algarismos e símbolos matemáticos escritos viram texto digitado.',
    inkDelay: 'Atraso da conversão', inkDelayNote: 'Segundos depois de parar de escrever.', alphabet: 'Alfabeto', latin: 'Latino', cyrillic: 'Cirílico',
    canvas: 'Tela', plain: 'Lisa', dots: 'Pontos', grid: 'Grade', language: 'Idioma',
    export: 'Exportar', cancel: 'Cancelar', format: 'Formato', resolution: 'Resolução', background: 'Fundo', board: 'Quadro', white: 'Branco', transparent: 'Transparente', exporting: 'Exportando…',
    nPng: 'Sem perdas. Mantém o fundo transparente.', nJpeg: 'Arquivos pequenos. Sem transparência.', nWebp: 'Menor que PNG. Mantém o fundo transparente.',
    nBmp: 'Sem compressão. Sem transparência.', nSvg: 'Vetorial. Nítido em qualquer tamanho e editável.', nPdf: 'Vetorial. Ideal para imprimir e compartilhar.',
    selected: '{n} selecionados', delete: 'Apagar', deleted: 'Apagado',
    sLine: 'Linha', sPolyline: 'Linha quebrada', sCurve: 'Curva', sTriangle: 'Triângulo', sRectangle: 'Retângulo', sSquare: 'Quadrado', sQuad: 'Quadrilátero', sPentagon: 'Pentágono', sHexagon: 'Hexágono', sCircle: 'Círculo', sEllipse: 'Elipse',
    tNoShape: 'Não há forma fechada para preencher aqui', tCleared: 'Quadro limpo', tOpened: '“{t}” aberto', tSaved: 'Salvo', tSavedDl: 'Salvo em Downloads',
    tNothing: 'Ainda não há nada para exportar', tExported: '{t} exportado', tLowRes: 'Exportado em resolução menor para caber', tExportFail: 'Falha ao exportar',
    eInvalid: 'Este arquivo não é um WHTBD válido.', eNotBoard: 'Este arquivo não é um quadro.', eNewer: 'Este quadro foi criado com uma versão mais recente.',
    fSans: 'Sem serifa', fSerif: 'Com serifa', fMono: 'Mono', fRounded: 'Arredondada', fHand: 'Manuscrita',
    font: 'Fonte', smaller: 'Texto menor', larger: 'Texto maior', textColor: 'Cor do texto', pickColor: 'Capturar uma cor do quadro', colorFormat: 'Mudar formato da cor',
  };

  D.ru = {
    untitled: 'Без названия',
    hint1: 'Рисуйте где угодно. Сводите пальцы или прокручивайте, чтобы перемещаться.',
    hint2: 'Задержите перо в конце штриха, и он превратится в ровную фигуру.',
    hint3: 'Перетащите цвет из панели в замкнутую фигуру, чтобы залить её.',
    menu: 'Меню', boardName: 'Название доски', undo: 'Отменить', redo: 'Повторить', zoom: 'Масштаб', thickness: 'Толщина', opacity: 'Непрозрачность',
    pen: 'Перо', eraser: 'Ластик', text: 'Текст', select: 'Выделение', move: 'Перемещение', customColor: 'Свой цвет',
    mNew: 'Новая доска', mOpen: 'Открыть…', mSave: 'Сохранить', mExport: 'Экспорт…', mClear: 'Очистить доску', mSettings: 'Настройки…',
    zIn: 'Увеличить', zOut: 'Уменьшить', zActual: 'Реальный размер', zFit: 'По содержимому',
    settings: 'Настройки', done: 'Готово', appearance: 'Оформление', theme: 'Тема', light: 'Светлая', dark: 'Тёмная', system: 'Системная',
    canvasColor: 'Цвет холста', custom: 'Свой',
    drawing: 'Рисование', smoothing: 'Сглаживание штриха', off: 'Выкл.', smoothingNote: 'Выкл.: каждый штрих остаётся точно таким, как вы его нарисовали.',
    snap: 'Удержание для выравнивания фигур', snapNote: 'Задержитесь в конце штриха, и он станет ровной фигурой.',
    snapDelay: 'Задержка выравнивания', snapDelayNote: 'Сколько секунд держать перо неподвижно.',
    finger: 'Рисовать пальцем', fingerNote: 'Выкл.: рисует только стилус, а один палец двигает доску.',
    handwriting: 'Рукописный ввод', ink: 'Преобразовывать почерк в текст', inkNote: 'Написанные буквы, цифры и математические знаки превращаются в печатный текст.',
    inkDelay: 'Задержка преобразования', inkDelayNote: 'Секунды после окончания письма.', alphabet: 'Алфавит', latin: 'Латиница', cyrillic: 'Кириллица',
    canvas: 'Холст', plain: 'Чистый', dots: 'Точки', grid: 'Сетка', language: 'Язык',
    export: 'Экспорт', cancel: 'Отмена', format: 'Формат', resolution: 'Разрешение', background: 'Фон', board: 'Как на доске', white: 'Белый', transparent: 'Прозрачный', exporting: 'Экспорт…',
    nPng: 'Без потерь. Сохраняет прозрачный фон.', nJpeg: 'Небольшие файлы. Без прозрачности.', nWebp: 'Меньше, чем PNG. Сохраняет прозрачный фон.',
    nBmp: 'Без сжатия. Без прозрачности.', nSvg: 'Вектор. Чёткий при любом размере, можно редактировать.', nPdf: 'Вектор. Лучше всего для печати и отправки.',
    selected: 'Выбрано: {n}', delete: 'Удалить', deleted: 'Удалено',
    sLine: 'Линия', sPolyline: 'Ломаная', sCurve: 'Кривая', sTriangle: 'Треугольник', sRectangle: 'Прямоугольник', sSquare: 'Квадрат', sQuad: 'Четырёхугольник', sPentagon: 'Пятиугольник', sHexagon: 'Шестиугольник', sCircle: 'Круг', sEllipse: 'Эллипс',
    tNoShape: 'Здесь нет замкнутой фигуры для заливки', tCleared: 'Доска очищена', tOpened: 'Открыто: «{t}»', tSaved: 'Сохранено', tSavedDl: 'Сохранено в «Загрузки»',
    tNothing: 'Пока нечего экспортировать', tExported: 'Экспортировано: {t}', tLowRes: 'Экспортировано в меньшем разрешении, чтобы уместилось', tExportFail: 'Не удалось экспортировать',
    eInvalid: 'Этот файл не является корректным WHTBD.', eNotBoard: 'Этот файл не является доской.', eNewer: 'Эта доска создана в более новой версии.',
    fSans: 'Без засечек', fSerif: 'С засечками', fMono: 'Моноширинный', fRounded: 'Скруглённый', fHand: 'Рукописный',
    font: 'Шрифт', smaller: 'Уменьшить текст', larger: 'Увеличить текст', textColor: 'Цвет текста', pickColor: 'Взять цвет с доски', colorFormat: 'Сменить формат цвета',
  };

  D.uk = {
    untitled: 'Без назви',
    hint1: 'Малюйте будь-де. Зводьте пальці або прокручуйте, щоб переміщатися.',
    hint2: 'Затримайте перо в кінці штриха, і він перетвориться на рівну фігуру.',
    hint3: 'Перетягніть колір із панелі в замкнену фігуру, щоб залити її.',
    menu: 'Меню', boardName: 'Назва дошки', undo: 'Скасувати', redo: 'Повторити', zoom: 'Масштаб', thickness: 'Товщина', opacity: 'Непрозорість',
    pen: 'Перо', eraser: 'Гумка', text: 'Текст', select: 'Виділення', move: 'Переміщення', customColor: 'Власний колір',
    mNew: 'Нова дошка', mOpen: 'Відкрити…', mSave: 'Зберегти', mExport: 'Експорт…', mClear: 'Очистити дошку', mSettings: 'Налаштування…',
    zIn: 'Збільшити', zOut: 'Зменшити', zActual: 'Справжній розмір', zFit: 'За вмістом',
    settings: 'Налаштування', done: 'Готово', appearance: 'Вигляд', theme: 'Тема', light: 'Світла', dark: 'Темна', system: 'Системна',
    canvasColor: 'Колір полотна', custom: 'Власний',
    drawing: 'Малювання', smoothing: 'Згладжування штриха', off: 'Вимк.', smoothingNote: 'Вимк.: кожен штрих лишається точно таким, як ви його намалювали.',
    snap: 'Утримання для вирівнювання фігур', snapNote: 'Затримайтеся в кінці штриха, і він стане рівною фігурою.',
    snapDelay: 'Затримка вирівнювання', snapDelayNote: 'Скільки секунд тримати перо нерухомо.',
    finger: 'Малювати пальцем', fingerNote: 'Вимк.: малює лише стилус, а один палець рухає дошку.',
    handwriting: 'Рукописне введення', ink: 'Перетворювати почерк на текст', inkNote: 'Написані літери, цифри та математичні знаки стають друкованим текстом.',
    inkDelay: 'Затримка перетворення', inkDelayNote: 'Секунди після завершення письма.', alphabet: 'Абетка', latin: 'Латиниця', cyrillic: 'Кирилиця',
    canvas: 'Полотно', plain: 'Чисте', dots: 'Крапки', grid: 'Сітка', language: 'Мова',
    export: 'Експорт', cancel: 'Скасувати', format: 'Формат', resolution: 'Роздільність', background: 'Тло', board: 'Як на дошці', white: 'Біле', transparent: 'Прозоре', exporting: 'Експорт…',
    nPng: 'Без втрат. Зберігає прозоре тло.', nJpeg: 'Невеликі файли. Без прозорості.', nWebp: 'Менший за PNG. Зберігає прозоре тло.',
    nBmp: 'Без стиснення. Без прозорості.', nSvg: 'Вектор. Чіткий за будь-якого розміру, можна редагувати.', nPdf: 'Вектор. Найкраще для друку й надсилання.',
    selected: 'Вибрано: {n}', delete: 'Видалити', deleted: 'Видалено',
    sLine: 'Лінія', sPolyline: 'Ламана', sCurve: 'Крива', sTriangle: 'Трикутник', sRectangle: 'Прямокутник', sSquare: 'Квадрат', sQuad: 'Чотирикутник', sPentagon: 'П’ятикутник', sHexagon: 'Шестикутник', sCircle: 'Коло', sEllipse: 'Еліпс',
    tNoShape: 'Тут немає замкненої фігури для заливки', tCleared: 'Дошку очищено', tOpened: 'Відкрито: «{t}»', tSaved: 'Збережено', tSavedDl: 'Збережено в «Завантаження»',
    tNothing: 'Поки що нема чого експортувати', tExported: 'Експортовано: {t}', tLowRes: 'Експортовано з меншою роздільністю, щоб умістилося', tExportFail: 'Не вдалося експортувати',
    eInvalid: 'Цей файл не є коректним WHTBD.', eNotBoard: 'Цей файл не є дошкою.', eNewer: 'Цю дошку створено в новішій версії.',
    fSans: 'Без засічок', fSerif: 'Із засічками', fMono: 'Моноширинний', fRounded: 'Заокруглений', fHand: 'Рукописний',
    font: 'Шрифт', smaller: 'Зменшити текст', larger: 'Збільшити текст', textColor: 'Колір тексту', pickColor: 'Взяти колір із дошки', colorFormat: 'Змінити формат кольору',
  };

  D.tr = {
    untitled: 'Adsız',
    hint1: 'İstediğiniz yere çizin. Gezinmek için kıstırın veya kaydırın.',
    hint2: 'Çizginin sonunda kalemi sabit tutun; çizim düzgün bir şekle dönüşür.',
    hint3: 'Doldurmak için çubuktan bir rengi kapalı bir şeklin içine sürükleyin.',
    menu: 'Menü', boardName: 'Tahta adı', undo: 'Geri al', redo: 'Yinele', zoom: 'Yakınlaştırma', thickness: 'Kalınlık', opacity: 'Opaklık',
    pen: 'Kalem', eraser: 'Silgi', text: 'Metin', select: 'Seç', move: 'Taşı', customColor: 'Özel renk',
    mNew: 'Yeni tahta', mOpen: 'Aç…', mSave: 'Kaydet', mExport: 'Dışa aktar…', mClear: 'Tahtayı temizle', mSettings: 'Ayarlar…',
    zIn: 'Yakınlaştır', zOut: 'Uzaklaştır', zActual: 'Gerçek boyut', zFit: 'İçeriğe sığdır',
    settings: 'Ayarlar', done: 'Bitti', appearance: 'Görünüm', theme: 'Tema', light: 'Açık', dark: 'Koyu', system: 'Sistem',
    canvasColor: 'Tuval rengi', custom: 'Özel',
    drawing: 'Çizim', smoothing: 'Çizgi yumuşatma', off: 'Kapalı', smoothingNote: 'Kapalıyken her çizgi tam çizdiğiniz gibi kalır.',
    snap: 'Şekil düzeltmek için basılı tut', snapNote: 'Çizginin sonunda durun; düzgün bir şekle dönüşür.',
    snapDelay: 'Düzeltme gecikmesi', snapDelayNote: 'Kalemin sabit tutulması gereken saniye.',
    finger: 'Parmakla çiz', fingerNote: 'Kapalıyken yalnızca kalemle çizilir; tek parmak tahtayı kaydırır.',
    handwriting: 'El yazısı', ink: 'El yazısını metne dönüştür', inkNote: 'Yazdığınız harfler, rakamlar ve matematik sembolleri yazılı metne dönüşür.',
    inkDelay: 'Dönüştürme gecikmesi', inkDelayNote: 'Yazmayı bıraktıktan sonraki saniye.', alphabet: 'Alfabe', latin: 'Latin', cyrillic: 'Kiril',
    canvas: 'Tuval', plain: 'Düz', dots: 'Noktalı', grid: 'Kareli', language: 'Dil',
    export: 'Dışa aktar', cancel: 'Vazgeç', format: 'Biçim', resolution: 'Çözünürlük', background: 'Arka plan', board: 'Tahta', white: 'Beyaz', transparent: 'Saydam', exporting: 'Dışa aktarılıyor…',
    nPng: 'Kayıpsız. Saydam arka planı korur.', nJpeg: 'Küçük dosyalar. Saydamlık yok.', nWebp: 'PNG’den küçük. Saydam arka planı korur.',
    nBmp: 'Sıkıştırılmamış. Saydamlık yok.', nSvg: 'Vektör. Her boyutta net kalır ve düzenlenebilir.', nPdf: 'Vektör. Yazdırma ve paylaşma için en iyisi.',
    selected: '{n} seçili', delete: 'Sil', deleted: 'Silindi',
    sLine: 'Çizgi', sPolyline: 'Kırık çizgi', sCurve: 'Eğri', sTriangle: 'Üçgen', sRectangle: 'Dikdörtgen', sSquare: 'Kare', sQuad: 'Dörtgen', sPentagon: 'Beşgen', sHexagon: 'Altıgen', sCircle: 'Daire', sEllipse: 'Elips',
    tNoShape: 'Burada doldurulacak kapalı bir şekil yok', tCleared: 'Tahta temizlendi', tOpened: '“{t}” açıldı', tSaved: 'Kaydedildi', tSavedDl: 'İndirilenler’e kaydedildi',
    tNothing: 'Henüz dışa aktarılacak bir şey yok', tExported: '{t} dışa aktarıldı', tLowRes: 'Sığması için daha düşük çözünürlükte dışa aktarıldı', tExportFail: 'Dışa aktarılamadı',
    eInvalid: 'Bu dosya geçerli bir WHTBD değil.', eNotBoard: 'Bu dosya bir tahta değil.', eNewer: 'Bu tahta daha yeni bir sürümle oluşturulmuş.',
    fSans: 'Serifsiz', fSerif: 'Serifli', fMono: 'Eş aralıklı', fRounded: 'Yuvarlak', fHand: 'El yazısı',
    font: 'Yazı tipi', smaller: 'Metni küçült', larger: 'Metni büyüt', textColor: 'Metin rengi', pickColor: 'Tahtadan renk al', colorFormat: 'Renk biçimini değiştir',
  };

  D.zh = {
    untitled: '未命名',
    hint1: '在任意位置绘画。双指捏合或滚动即可移动画面。',
    hint2: '在一笔结束时停住不动，它会变成规整的形状。',
    hint3: '把颜色从工具栏拖进封闭的形状里即可填充。',
    menu: '菜单', boardName: '白板名称', undo: '撤销', redo: '重做', zoom: '缩放', thickness: '粗细', opacity: '不透明度',
    pen: '画笔', eraser: '橡皮擦', text: '文字', select: '选择', move: '移动', customColor: '自定颜色',
    mNew: '新建白板', mOpen: '打开…', mSave: '保存', mExport: '导出…', mClear: '清空白板', mSettings: '设置…',
    zIn: '放大', zOut: '缩小', zActual: '实际大小', zFit: '适合内容',
    settings: '设置', done: '完成', appearance: '外观', theme: '主题', light: '浅色', dark: '深色', system: '跟随系统',
    canvasColor: '画布颜色', custom: '自定',
    drawing: '绘画', smoothing: '笔画平滑', off: '关', smoothingNote: '关闭时，每一笔都保持你画下的原样。',
    snap: '停住以规整形状', snapNote: '在一笔结束时停顿，它会变成规整的形状。',
    snapDelay: '规整延迟', snapDelayNote: '需要保持不动的秒数。',
    finger: '用手指绘画', fingerNote: '关闭后只能用触控笔绘画，单指用来移动白板。',
    handwriting: '手写', ink: '将手写转换为文字', inkNote: '写下的字母、数字和数学符号会变成输入的文字。',
    inkDelay: '转换延迟', inkDelayNote: '停止书写后的秒数。', alphabet: '字母表', latin: '拉丁字母', cyrillic: '西里尔字母',
    canvas: '画布', plain: '空白', dots: '点阵', grid: '网格', language: '语言',
    export: '导出', cancel: '取消', format: '格式', resolution: '分辨率', background: '背景', board: '白板', white: '白色', transparent: '透明', exporting: '正在导出…',
    nPng: '无损，保留透明背景。', nJpeg: '文件小，不支持透明。', nWebp: '比 PNG 更小，保留透明背景。',
    nBmp: '未压缩，不支持透明。', nSvg: '矢量，任意大小都清晰，且可编辑。', nPdf: '矢量，最适合打印和分享。',
    selected: '已选择 {n} 项', delete: '删除', deleted: '已删除',
    sLine: '直线', sPolyline: '折线', sCurve: '曲线', sTriangle: '三角形', sRectangle: '矩形', sSquare: '正方形', sQuad: '四边形', sPentagon: '五边形', sHexagon: '六边形', sCircle: '圆', sEllipse: '椭圆',
    tNoShape: '这里没有可填充的封闭形状', tCleared: '白板已清空', tOpened: '已打开“{t}”', tSaved: '已保存', tSavedDl: '已保存到“下载”',
    tNothing: '还没有可导出的内容', tExported: '已导出 {t}', tLowRes: '为适应限制，已用较低分辨率导出', tExportFail: '导出失败',
    eInvalid: '此文件不是有效的 WHTBD。', eNotBoard: '此文件不是白板。', eNewer: '此白板由更新的版本创建。',
    fSans: '无衬线', fSerif: '衬线', fMono: '等宽', fRounded: '圆体', fHand: '手写体',
    font: '字体', smaller: '缩小文字', larger: '放大文字', textColor: '文字颜色', pickColor: '从白板取色', colorFormat: '切换颜色格式',
  };

  D.ja = {
    untitled: '名称未設定',
    hint1: 'どこにでも描けます。ピンチまたはスクロールで移動します。',
    hint2: '線の終わりでペンを止めると、きれいな図形に整います。',
    hint3: 'ドックから色を閉じた図形の中へドラッグすると塗りつぶせます。',
    menu: 'メニュー', boardName: 'ボード名', undo: '取り消す', redo: 'やり直す', zoom: 'ズーム', thickness: '太さ', opacity: '不透明度',
    pen: 'ペン', eraser: '消しゴム', text: 'テキスト', select: '選択', move: '移動', customColor: 'カスタムカラー',
    mNew: '新規ボード', mOpen: '開く…', mSave: '保存', mExport: '書き出す…', mClear: 'ボードを消去', mSettings: '設定…',
    zIn: '拡大', zOut: '縮小', zActual: '実際のサイズ', zFit: '内容に合わせる',
    settings: '設定', done: '完了', appearance: '外観', theme: 'テーマ', light: 'ライト', dark: 'ダーク', system: 'システム',
    canvasColor: 'キャンバスの色', custom: 'カスタム',
    drawing: '描画', smoothing: '線の補正', off: 'オフ', smoothingNote: 'オフでは、線は描いたとおりに残ります。',
    snap: '長押しで図形を整える', snapNote: '線の終わりで止めると、きれいな図形になります。',
    snapDelay: '整えるまでの時間', snapDelayNote: 'ペンを止めておく秒数。',
    finger: '指で描く', fingerNote: 'オフにするとスタイラスだけで描き、1本指でボードを動かします。',
    handwriting: '手書き', ink: '手書きをテキストに変換', inkNote: '書いた文字、数字、数学記号が入力テキストに変わります。',
    inkDelay: '変換までの時間', inkDelayNote: '書き終えてからの秒数。', alphabet: '文字の種類', latin: 'ラテン文字', cyrillic: 'キリル文字',
    canvas: 'キャンバス', plain: '無地', dots: 'ドット', grid: 'グリッド', language: '言語',
    export: '書き出す', cancel: 'キャンセル', format: 'フォーマット', resolution: '解像度', background: '背景', board: 'ボード', white: '白', transparent: '透明', exporting: '書き出し中…',
    nPng: '劣化なし。透明な背景を保持します。', nJpeg: 'ファイルが小さい。透明は使えません。', nWebp: 'PNG より小さい。透明な背景を保持します。',
    nBmp: '非圧縮。透明は使えません。', nSvg: 'ベクター。どのサイズでも鮮明で、編集できます。', nPdf: 'ベクター。印刷や共有に最適です。',
    selected: '{n} 個を選択中', delete: '削除', deleted: '削除しました',
    sLine: '直線', sPolyline: '折れ線', sCurve: '曲線', sTriangle: '三角形', sRectangle: '長方形', sSquare: '正方形', sQuad: '四角形', sPentagon: '五角形', sHexagon: '六角形', sCircle: '円', sEllipse: '楕円',
    tNoShape: 'ここには塗りつぶせる閉じた図形がありません', tCleared: 'ボードを消去しました', tOpened: '「{t}」を開きました', tSaved: '保存しました', tSavedDl: '「ダウンロード」に保存しました',
    tNothing: 'まだ書き出すものがありません', tExported: '{t} を書き出しました', tLowRes: '収まるように低い解像度で書き出しました', tExportFail: '書き出せませんでした',
    eInvalid: 'このファイルは有効な WHTBD ではありません。', eNotBoard: 'このファイルはボードではありません。', eNewer: 'このボードは新しいバージョンで作成されています。',
    fSans: 'ゴシック', fSerif: '明朝', fMono: '等幅', fRounded: '丸ゴシック', fHand: '手書き風',
    font: 'フォント', smaller: '文字を小さく', larger: '文字を大きく', textColor: '文字の色', pickColor: 'ボードから色を取る', colorFormat: 'カラー形式を切り替える',
  };

  D.ar = {
    untitled: 'بدون عنوان',
    hint1: 'ارسم في أي مكان. قرّب بإصبعين أو مرّر للتنقل.',
    hint2: 'ثبّت القلم في نهاية الخط ليتحول إلى شكل منتظم.',
    hint3: 'اسحب لونًا من الشريط إلى داخل شكل مغلق لتعبئته.',
    menu: 'القائمة', boardName: 'اسم اللوح', undo: 'تراجع', redo: 'إعادة', zoom: 'التكبير', thickness: 'السُّمك', opacity: 'العتامة',
    pen: 'قلم', eraser: 'ممحاة', text: 'نص', select: 'تحديد', move: 'تحريك', customColor: 'لون مخصص',
    mNew: 'لوح جديد', mOpen: 'فتح…', mSave: 'حفظ', mExport: 'تصدير…', mClear: 'مسح اللوح', mSettings: 'الإعدادات…',
    zIn: 'تكبير', zOut: 'تصغير', zActual: 'الحجم الفعلي', zFit: 'ملاءمة المحتوى',
    settings: 'الإعدادات', done: 'تم', appearance: 'المظهر', theme: 'السمة', light: 'فاتح', dark: 'داكن', system: 'النظام',
    canvasColor: 'لون اللوحة', custom: 'مخصص',
    drawing: 'الرسم', smoothing: 'تنعيم الخط', off: 'إيقاف', smoothingNote: 'عند الإيقاف يبقى كل خط كما رسمته تمامًا.',
    snap: 'الثبات لضبط الأشكال', snapNote: 'توقف في نهاية الخط ليصبح شكلًا منتظمًا.',
    snapDelay: 'مهلة الضبط', snapDelayNote: 'عدد الثواني التي يجب تثبيت القلم فيها.',
    finger: 'الرسم بالإصبع', fingerNote: 'عند الإيقاف يرسم القلم فقط، ويحرّك الإصبع الواحد اللوح.',
    handwriting: 'الكتابة باليد', ink: 'تحويل خط اليد إلى نص', inkNote: 'الحروف والأرقام والرموز الرياضية التي تكتبها تتحول إلى نص مطبوع.',
    inkDelay: 'مهلة التحويل', inkDelayNote: 'عدد الثواني بعد التوقف عن الكتابة.', alphabet: 'الأبجدية', latin: 'لاتينية', cyrillic: 'سيريلية',
    canvas: 'اللوحة', plain: 'فارغة', dots: 'نقاط', grid: 'شبكة', language: 'اللغة',
    export: 'تصدير', cancel: 'إلغاء', format: 'الصيغة', resolution: 'الدقة', background: 'الخلفية', board: 'اللوح', white: 'أبيض', transparent: 'شفاف', exporting: 'جارٍ التصدير…',
    nPng: 'بلا فقدان. يحافظ على الخلفية الشفافة.', nJpeg: 'ملفات صغيرة. بلا شفافية.', nWebp: 'أصغر من PNG. يحافظ على الخلفية الشفافة.',
    nBmp: 'غير مضغوط. بلا شفافية.', nSvg: 'متجهي. يبقى واضحًا بأي حجم وقابلًا للتعديل.', nPdf: 'متجهي. الأفضل للطباعة والمشاركة.',
    selected: 'المحدد: {n}', delete: 'حذف', deleted: 'تم الحذف',
    sLine: 'خط', sPolyline: 'خط منكسر', sCurve: 'منحنى', sTriangle: 'مثلث', sRectangle: 'مستطيل', sSquare: 'مربع', sQuad: 'رباعي الأضلاع', sPentagon: 'خماسي', sHexagon: 'سداسي', sCircle: 'دائرة', sEllipse: 'قطع ناقص',
    tNoShape: 'لا يوجد هنا شكل مغلق لتعبئته', tCleared: 'تم مسح اللوح', tOpened: 'تم فتح «{t}»', tSaved: 'تم الحفظ', tSavedDl: 'تم الحفظ في التنزيلات',
    tNothing: 'لا يوجد ما يمكن تصديره بعد', tExported: 'تم تصدير {t}', tLowRes: 'تم التصدير بدقة أقل ليناسب الحدود', tExportFail: 'تعذّر التصدير',
    eInvalid: 'هذا الملف ليس WHTBD صالحًا.', eNotBoard: 'هذا الملف ليس لوحًا.', eNewer: 'أُنشئ هذا اللوح بإصدار أحدث.',
    fSans: 'بلا زوائد', fSerif: 'بزوائد', fMono: 'ثابت العرض', fRounded: 'مدوّر', fHand: 'خط يد',
    font: 'الخط', smaller: 'تصغير النص', larger: 'تكبير النص', textColor: 'لون النص', pickColor: 'التقاط لون من اللوح', colorFormat: 'تغيير صيغة اللون',
  };

  D.hi = {
    untitled: 'शीर्षकहीन',
    hint1: 'कहीं भी बनाएँ। घूमने के लिए पिंच करें या स्क्रॉल करें।',
    hint2: 'रेखा के अंत में पेन को स्थिर रखें, वह साफ़ आकृति बन जाएगी।',
    hint3: 'भरने के लिए डॉक से कोई रंग बंद आकृति के अंदर खींचें।',
    menu: 'मेनू', boardName: 'बोर्ड का नाम', undo: 'पूर्ववत करें', redo: 'फिर से करें', zoom: 'ज़ूम', thickness: 'मोटाई', opacity: 'अपारदर्शिता',
    pen: 'पेन', eraser: 'रबर', text: 'टेक्स्ट', select: 'चुनें', move: 'खिसकाएँ', customColor: 'कस्टम रंग',
    mNew: 'नया बोर्ड', mOpen: 'खोलें…', mSave: 'सहेजें', mExport: 'निर्यात करें…', mClear: 'बोर्ड साफ़ करें', mSettings: 'सेटिंग्स…',
    zIn: 'ज़ूम इन', zOut: 'ज़ूम आउट', zActual: 'वास्तविक आकार', zFit: 'सामग्री के अनुसार',
    settings: 'सेटिंग्स', done: 'हो गया', appearance: 'दिखावट', theme: 'थीम', light: 'हल्की', dark: 'गहरी', system: 'सिस्टम',
    canvasColor: 'कैनवास का रंग', custom: 'कस्टम',
    drawing: 'ड्रॉइंग', smoothing: 'रेखा स्मूदिंग', off: 'बंद', smoothingNote: 'बंद होने पर हर रेखा ठीक वैसी रहती है जैसी आपने खींची।',
    snap: 'आकृति ठीक करने के लिए रोककर रखें', snapNote: 'रेखा के अंत में रुकें, वह साफ़ आकृति बन जाएगी।',
    snapDelay: 'आकृति ठीक होने की देरी', snapDelayNote: 'पेन को कितने सेकंड स्थिर रखना है।',
    finger: 'उँगली से बनाएँ', fingerNote: 'बंद करने पर केवल स्टाइलस से बनेगा; एक उँगली बोर्ड को खिसकाएगी।',
    handwriting: 'हस्तलेखन', ink: 'हस्तलेखन को टेक्स्ट में बदलें', inkNote: 'आपके लिखे अक्षर, अंक और गणित के चिह्न टाइप किए हुए टेक्स्ट में बदल जाते हैं।',
    inkDelay: 'बदलने की देरी', inkDelayNote: 'लिखना रोकने के बाद के सेकंड।', alphabet: 'वर्णमाला', latin: 'लैटिन', cyrillic: 'सिरिलिक',
    canvas: 'कैनवास', plain: 'सादा', dots: 'बिंदु', grid: 'ग्रिड', language: 'भाषा',
    export: 'निर्यात करें', cancel: 'रद्द करें', format: 'फ़ॉर्मैट', resolution: 'रिज़ॉल्यूशन', background: 'पृष्ठभूमि', board: 'बोर्ड', white: 'सफ़ेद', transparent: 'पारदर्शी', exporting: 'निर्यात हो रहा है…',
    nPng: 'बिना गुणवत्ता खोए। पारदर्शी पृष्ठभूमि बनी रहती है।', nJpeg: 'छोटी फ़ाइलें। पारदर्शिता नहीं।', nWebp: 'PNG से छोटी। पारदर्शी पृष्ठभूमि बनी रहती है।',
    nBmp: 'बिना संपीड़न। पारदर्शिता नहीं।', nSvg: 'वेक्टर। हर आकार में साफ़ और संपादन योग्य।', nPdf: 'वेक्टर। छापने और साझा करने के लिए सबसे अच्छा।',
    selected: '{n} चयनित', delete: 'हटाएँ', deleted: 'हटाया गया',
    sLine: 'रेखा', sPolyline: 'टूटी रेखा', sCurve: 'वक्र', sTriangle: 'त्रिभुज', sRectangle: 'आयत', sSquare: 'वर्ग', sQuad: 'चतुर्भुज', sPentagon: 'पंचभुज', sHexagon: 'षट्भुज', sCircle: 'वृत्त', sEllipse: 'दीर्घवृत्त',
    tNoShape: 'यहाँ भरने के लिए कोई बंद आकृति नहीं है', tCleared: 'बोर्ड साफ़ किया गया', tOpened: '“{t}” खोला गया', tSaved: 'सहेजा गया', tSavedDl: 'डाउनलोड में सहेजा गया',
    tNothing: 'अभी निर्यात करने के लिए कुछ नहीं है', tExported: '{t} निर्यात किया गया', tLowRes: 'सीमा में रखने के लिए कम रिज़ॉल्यूशन पर निर्यात किया गया', tExportFail: 'निर्यात नहीं हो सका',
    eInvalid: 'यह फ़ाइल मान्य WHTBD नहीं है।', eNotBoard: 'यह फ़ाइल बोर्ड नहीं है।', eNewer: 'यह बोर्ड नए संस्करण से बनाया गया है।',
    fSans: 'सैन्स', fSerif: 'सेरिफ़', fMono: 'मोनो', fRounded: 'गोल', fHand: 'हस्तलिखित',
    font: 'फ़ॉन्ट', smaller: 'टेक्स्ट छोटा करें', larger: 'टेक्स्ट बड़ा करें', textColor: 'टेक्स्ट का रंग', pickColor: 'बोर्ड से रंग लें', colorFormat: 'रंग फ़ॉर्मैट बदलें',
  };

  /* Gallery and file menu. */
  Object.assign(D.en, {
    mGallery: 'Gallery', mSaveGallery: 'Save to gallery', mSaveTo: 'Save as…', mOpenFrom: 'Open from…',
    gNewFolder: 'New folder', gEmpty: 'Nothing here yet', gOpen: 'Open', gRename: 'Rename', gDuplicate: 'Duplicate', gMove: 'Move…', gMoveHere: 'Move here',
    gMoving: 'Choose where to move “{t}”', gDeleteAsk: 'Delete “{t}”? This cannot be undone.', gCopy: '{t} copy',
    gSetup: 'Choose where your gallery lives. A folder named “Whiteboard gallery” is created there. Your Documents folder is a good place.',
    gChoose: 'Choose folder…', gPrivate: 'Keep it in this browser', gAllow: 'The gallery folder needs your permission again.', gAllowBtn: 'Allow',
    gBrowserNote: 'Stored inside this browser on this device.', gChange: 'Change folder…', gError: 'Could not reach the gallery folder',
    tSavedGallery: 'Saved to gallery', tSaveFail: 'Could not save the file',
  });
  Object.assign(D.hu, {
    mGallery: 'Galéria', mSaveGallery: 'Mentés a galériába', mSaveTo: 'Mentés másként…', mOpenFrom: 'Megnyitás innen…',
    gNewFolder: 'Új mappa', gEmpty: 'Itt még nincs semmi', gOpen: 'Megnyitás', gRename: 'Átnevezés', gDuplicate: 'Másolat készítése', gMove: 'Áthelyezés…', gMoveHere: 'Áthelyezés ide',
    gMoving: 'Válaszd ki, hová kerüljön: „{t}”', gDeleteAsk: 'Törlöd ezt: „{t}”? Ez nem vonható vissza.', gCopy: '{t} másolata',
    gSetup: 'Válaszd ki, hol legyen a galériád. Ott létrejön egy „Whiteboard gallery” nevű mappa. A Dokumentumok mappa jó választás.',
    gChoose: 'Mappa kiválasztása…', gPrivate: 'Maradjon ebben a böngészőben', gAllow: 'A galéria mappájához újra engedély kell.', gAllowBtn: 'Engedélyezés',
    gBrowserNote: 'Ebben a böngészőben, ezen az eszközön tárolva.', gChange: 'Másik mappa…', gError: 'A galéria mappája nem érhető el',
    tSavedGallery: 'Mentve a galériába', tSaveFail: 'A fájlt nem sikerült menteni',
  });
  Object.assign(D.de, {
    mGallery: 'Galerie', mSaveGallery: 'In Galerie speichern', mSaveTo: 'Speichern unter…', mOpenFrom: 'Öffnen von…',
    gNewFolder: 'Neuer Ordner', gEmpty: 'Hier ist noch nichts', gOpen: 'Öffnen', gRename: 'Umbenennen', gDuplicate: 'Duplizieren', gMove: 'Bewegen…', gMoveHere: 'Hierher bewegen',
    gMoving: 'Wähle, wohin „{t}“ bewegt werden soll', gDeleteAsk: '„{t}“ löschen? Das kann nicht rückgängig gemacht werden.', gCopy: '{t} Kopie',
    gSetup: 'Wähle, wo deine Galerie liegen soll. Dort wird ein Ordner „Whiteboard gallery“ angelegt. Der Ordner „Dokumente“ ist ein guter Ort.',
    gChoose: 'Ordner wählen…', gPrivate: 'In diesem Browser behalten', gAllow: 'Der Galerieordner braucht erneut deine Erlaubnis.', gAllowBtn: 'Erlauben',
    gBrowserNote: 'In diesem Browser auf diesem Gerät gespeichert.', gChange: 'Ordner ändern…', gError: 'Der Galerieordner ist nicht erreichbar',
    tSavedGallery: 'In der Galerie gespeichert', tSaveFail: 'Die Datei konnte nicht gespeichert werden',
  });
  Object.assign(D.fr, {
    mGallery: 'Galerie', mSaveGallery: 'Enregistrer dans la galerie', mSaveTo: 'Enregistrer sous…', mOpenFrom: 'Ouvrir depuis…',
    gNewFolder: 'Nouveau dossier', gEmpty: 'Rien ici pour l’instant', gOpen: 'Ouvrir', gRename: 'Renommer', gDuplicate: 'Dupliquer', gMove: 'Déplacer…', gMoveHere: 'Déplacer ici',
    gMoving: 'Choisissez où déplacer « {t} »', gDeleteAsk: 'Supprimer « {t} » ? Cette action est irréversible.', gCopy: '{t} copie',
    gSetup: 'Choisissez l’emplacement de votre galerie. Un dossier « Whiteboard gallery » y sera créé. Le dossier Documents est un bon choix.',
    gChoose: 'Choisir un dossier…', gPrivate: 'La garder dans ce navigateur', gAllow: 'Le dossier de la galerie a de nouveau besoin de votre autorisation.', gAllowBtn: 'Autoriser',
    gBrowserNote: 'Stockée dans ce navigateur, sur cet appareil.', gChange: 'Changer de dossier…', gError: 'Impossible d’accéder au dossier de la galerie',
    tSavedGallery: 'Enregistré dans la galerie', tSaveFail: 'Impossible d’enregistrer le fichier',
  });
  Object.assign(D.it, {
    mGallery: 'Galleria', mSaveGallery: 'Salva nella galleria', mSaveTo: 'Salva con nome…', mOpenFrom: 'Apri da…',
    gNewFolder: 'Nuova cartella', gEmpty: 'Qui non c’è ancora niente', gOpen: 'Apri', gRename: 'Rinomina', gDuplicate: 'Duplica', gMove: 'Sposta…', gMoveHere: 'Sposta qui',
    gMoving: 'Scegli dove spostare “{t}”', gDeleteAsk: 'Eliminare “{t}”? L’operazione non può essere annullata.', gCopy: '{t} copia',
    gSetup: 'Scegli dove tenere la galleria. Lì verrà creata una cartella “Whiteboard gallery”. La cartella Documenti è una buona scelta.',
    gChoose: 'Scegli cartella…', gPrivate: 'Tienila in questo browser', gAllow: 'La cartella della galleria richiede di nuovo il tuo permesso.', gAllowBtn: 'Consenti',
    gBrowserNote: 'Salvata in questo browser, su questo dispositivo.', gChange: 'Cambia cartella…', gError: 'Impossibile raggiungere la cartella della galleria',
    tSavedGallery: 'Salvato nella galleria', tSaveFail: 'Impossibile salvare il file',
  });
  Object.assign(D.es, {
    mGallery: 'Galería', mSaveGallery: 'Guardar en la galería', mSaveTo: 'Guardar como…', mOpenFrom: 'Abrir desde…',
    gNewFolder: 'Nueva carpeta', gEmpty: 'Aquí todavía no hay nada', gOpen: 'Abrir', gRename: 'Renombrar', gDuplicate: 'Duplicar', gMove: 'Mover…', gMoveHere: 'Mover aquí',
    gMoving: 'Elige adónde mover «{t}»', gDeleteAsk: '¿Eliminar «{t}»? Esto no se puede deshacer.', gCopy: '{t} copia',
    gSetup: 'Elige dónde estará tu galería. Allí se creará una carpeta «Whiteboard gallery». La carpeta Documentos es un buen lugar.',
    gChoose: 'Elegir carpeta…', gPrivate: 'Mantenerla en este navegador', gAllow: 'La carpeta de la galería necesita tu permiso de nuevo.', gAllowBtn: 'Permitir',
    gBrowserNote: 'Guardada en este navegador, en este dispositivo.', gChange: 'Cambiar carpeta…', gError: 'No se pudo acceder a la carpeta de la galería',
    tSavedGallery: 'Guardado en la galería', tSaveFail: 'No se pudo guardar el archivo',
  });
  Object.assign(D.pt, {
    mGallery: 'Galeria', mSaveGallery: 'Salvar na galeria', mSaveTo: 'Salvar como…', mOpenFrom: 'Abrir de…',
    gNewFolder: 'Nova pasta', gEmpty: 'Ainda não há nada aqui', gOpen: 'Abrir', gRename: 'Renomear', gDuplicate: 'Duplicar', gMove: 'Mover…', gMoveHere: 'Mover para cá',
    gMoving: 'Escolha para onde mover “{t}”', gDeleteAsk: 'Apagar “{t}”? Isso não pode ser desfeito.', gCopy: '{t} cópia',
    gSetup: 'Escolha onde a galeria vai ficar. Uma pasta “Whiteboard gallery” será criada lá. A pasta Documentos é um bom lugar.',
    gChoose: 'Escolher pasta…', gPrivate: 'Manter neste navegador', gAllow: 'A pasta da galeria precisa da sua permissão novamente.', gAllowBtn: 'Permitir',
    gBrowserNote: 'Guardada neste navegador, neste dispositivo.', gChange: 'Trocar pasta…', gError: 'Não foi possível acessar a pasta da galeria',
    tSavedGallery: 'Salvo na galeria', tSaveFail: 'Não foi possível salvar o arquivo',
  });
  Object.assign(D.ru, {
    mGallery: 'Галерея', mSaveGallery: 'Сохранить в галерею', mSaveTo: 'Сохранить как…', mOpenFrom: 'Открыть из…',
    gNewFolder: 'Новая папка', gEmpty: 'Здесь пока ничего нет', gOpen: 'Открыть', gRename: 'Переименовать', gDuplicate: 'Дублировать', gMove: 'Переместить…', gMoveHere: 'Переместить сюда',
    gMoving: 'Выберите, куда переместить «{t}»', gDeleteAsk: 'Удалить «{t}»? Это действие нельзя отменить.', gCopy: '{t} — копия',
    gSetup: 'Выберите, где будет находиться галерея. Там будет создана папка «Whiteboard gallery». Папка «Документы» — хорошее место.',
    gChoose: 'Выбрать папку…', gPrivate: 'Хранить в этом браузере', gAllow: 'Папке галереи снова нужно ваше разрешение.', gAllowBtn: 'Разрешить',
    gBrowserNote: 'Хранится в этом браузере на этом устройстве.', gChange: 'Сменить папку…', gError: 'Не удалось открыть папку галереи',
    tSavedGallery: 'Сохранено в галерею', tSaveFail: 'Не удалось сохранить файл',
  });
  Object.assign(D.uk, {
    mGallery: 'Галерея', mSaveGallery: 'Зберегти в галерею', mSaveTo: 'Зберегти як…', mOpenFrom: 'Відкрити з…',
    gNewFolder: 'Нова папка', gEmpty: 'Тут поки що нічого немає', gOpen: 'Відкрити', gRename: 'Перейменувати', gDuplicate: 'Дублювати', gMove: 'Перемістити…', gMoveHere: 'Перемістити сюди',
    gMoving: 'Виберіть, куди перемістити «{t}»', gDeleteAsk: 'Видалити «{t}»? Цю дію не можна скасувати.', gCopy: '{t} — копія',
    gSetup: 'Виберіть, де буде ваша галерея. Там буде створено папку «Whiteboard gallery». Папка «Документи» — гарне місце.',
    gChoose: 'Вибрати папку…', gPrivate: 'Зберігати в цьому браузері', gAllow: 'Папці галереї знову потрібен ваш дозвіл.', gAllowBtn: 'Дозволити',
    gBrowserNote: 'Зберігається в цьому браузері на цьому пристрої.', gChange: 'Змінити папку…', gError: 'Не вдалося відкрити папку галереї',
    tSavedGallery: 'Збережено в галерею', tSaveFail: 'Не вдалося зберегти файл',
  });
  Object.assign(D.tr, {
    mGallery: 'Galeri', mSaveGallery: 'Galeriye kaydet', mSaveTo: 'Farklı kaydet…', mOpenFrom: 'Şuradan aç…',
    gNewFolder: 'Yeni klasör', gEmpty: 'Burada henüz bir şey yok', gOpen: 'Aç', gRename: 'Yeniden adlandır', gDuplicate: 'Çoğalt', gMove: 'Taşı…', gMoveHere: 'Buraya taşı',
    gMoving: '“{t}” nereye taşınsın?', gDeleteAsk: '“{t}” silinsin mi? Bu işlem geri alınamaz.', gCopy: '{t} kopyası',
    gSetup: 'Galerinizin nerede duracağını seçin. Orada “Whiteboard gallery” adlı bir klasör oluşturulur. Belgeler klasörü iyi bir yerdir.',
    gChoose: 'Klasör seç…', gPrivate: 'Bu tarayıcıda tut', gAllow: 'Galeri klasörü için yeniden izniniz gerekiyor.', gAllowBtn: 'İzin ver',
    gBrowserNote: 'Bu cihazda, bu tarayıcının içinde saklanır.', gChange: 'Klasörü değiştir…', gError: 'Galeri klasörüne ulaşılamadı',
    tSavedGallery: 'Galeriye kaydedildi', tSaveFail: 'Dosya kaydedilemedi',
  });
  Object.assign(D.zh, {
    mGallery: '图库', mSaveGallery: '保存到图库', mSaveTo: '另存为…', mOpenFrom: '从…打开',
    gNewFolder: '新建文件夹', gEmpty: '这里还没有内容', gOpen: '打开', gRename: '重命名', gDuplicate: '复制', gMove: '移动…', gMoveHere: '移到这里',
    gMoving: '选择要把“{t}”移到哪里', gDeleteAsk: '删除“{t}”？此操作无法撤销。', gCopy: '{t} 副本',
    gSetup: '选择图库存放的位置。那里会创建一个名为“Whiteboard gallery”的文件夹。“文档”文件夹是个不错的位置。',
    gChoose: '选择文件夹…', gPrivate: '保存在此浏览器中', gAllow: '需要再次获得访问图库文件夹的许可。', gAllowBtn: '允许',
    gBrowserNote: '存放在此设备的此浏览器中。', gChange: '更改文件夹…', gError: '无法访问图库文件夹',
    tSavedGallery: '已保存到图库', tSaveFail: '无法保存文件',
  });
  Object.assign(D.ja, {
    mGallery: 'ギャラリー', mSaveGallery: 'ギャラリーに保存', mSaveTo: '名前を付けて保存…', mOpenFrom: '場所を選んで開く…',
    gNewFolder: '新規フォルダ', gEmpty: 'まだ何もありません', gOpen: '開く', gRename: '名前を変更', gDuplicate: '複製', gMove: '移動…', gMoveHere: 'ここに移動',
    gMoving: '「{t}」の移動先を選んでください', gDeleteAsk: '「{t}」を削除しますか？この操作は取り消せません。', gCopy: '{t} のコピー',
    gSetup: 'ギャラリーの保存場所を選んでください。そこに「Whiteboard gallery」というフォルダが作られます。「ドキュメント」フォルダがおすすめです。',
    gChoose: 'フォルダを選ぶ…', gPrivate: 'このブラウザ内に保存', gAllow: 'ギャラリーフォルダへのアクセス許可がもう一度必要です。', gAllowBtn: '許可',
    gBrowserNote: 'このデバイスのこのブラウザ内に保存されています。', gChange: 'フォルダを変更…', gError: 'ギャラリーフォルダにアクセスできません',
    tSavedGallery: 'ギャラリーに保存しました', tSaveFail: 'ファイルを保存できませんでした',
  });
  Object.assign(D.ar, {
    mGallery: 'المعرض', mSaveGallery: 'حفظ في المعرض', mSaveTo: 'حفظ باسم…', mOpenFrom: 'فتح من…',
    gNewFolder: 'مجلد جديد', gEmpty: 'لا يوجد شيء هنا بعد', gOpen: 'فتح', gRename: 'إعادة تسمية', gDuplicate: 'تكرار', gMove: 'نقل…', gMoveHere: 'نقل إلى هنا',
    gMoving: 'اختر المكان الذي تريد نقل «{t}» إليه', gDeleteAsk: 'حذف «{t}»؟ لا يمكن التراجع عن هذا.', gCopy: 'نسخة من {t}',
    gSetup: 'اختر مكان المعرض. سيُنشأ هناك مجلد باسم «Whiteboard gallery». مجلد المستندات مكان مناسب.',
    gChoose: 'اختيار مجلد…', gPrivate: 'الاحتفاظ به في هذا المتصفح', gAllow: 'مجلد المعرض يحتاج إلى إذنك مرة أخرى.', gAllowBtn: 'السماح',
    gBrowserNote: 'مخزَّن داخل هذا المتصفح على هذا الجهاز.', gChange: 'تغيير المجلد…', gError: 'تعذّر الوصول إلى مجلد المعرض',
    tSavedGallery: 'تم الحفظ في المعرض', tSaveFail: 'تعذّر حفظ الملف',
  });
  Object.assign(D.hi, {
    mGallery: 'गैलरी', mSaveGallery: 'गैलरी में सहेजें', mSaveTo: 'इस रूप में सहेजें…', mOpenFrom: 'यहाँ से खोलें…',
    gNewFolder: 'नया फ़ोल्डर', gEmpty: 'यहाँ अभी कुछ नहीं है', gOpen: 'खोलें', gRename: 'नाम बदलें', gDuplicate: 'प्रतिलिपि बनाएँ', gMove: 'ले जाएँ…', gMoveHere: 'यहाँ ले जाएँ',
    gMoving: 'चुनें कि “{t}” को कहाँ ले जाना है', gDeleteAsk: '“{t}” हटाएँ? इसे पूर्ववत नहीं किया जा सकता।', gCopy: '{t} की प्रति',
    gSetup: 'चुनें कि आपकी गैलरी कहाँ रहेगी। वहाँ “Whiteboard gallery” नाम का फ़ोल्डर बनेगा। दस्तावेज़ फ़ोल्डर एक अच्छी जगह है।',
    gChoose: 'फ़ोल्डर चुनें…', gPrivate: 'इसी ब्राउज़र में रखें', gAllow: 'गैलरी फ़ोल्डर के लिए फिर से आपकी अनुमति चाहिए।', gAllowBtn: 'अनुमति दें',
    gBrowserNote: 'इस डिवाइस पर इसी ब्राउज़र के अंदर संग्रहीत।', gChange: 'फ़ोल्डर बदलें…', gError: 'गैलरी फ़ोल्डर तक नहीं पहुँचा जा सका',
    tSavedGallery: 'गैलरी में सहेजा गया', tSaveFail: 'फ़ाइल सहेजी नहीं जा सकी',
  });

  /* Gallery setup instructions. Browsers refuse the Documents folder itself, so the text says to pick a folder inside it. */
  D.en.gSetup = 'Choose where your gallery lives. Browsers do not allow selecting Documents itself: open Documents, create a new folder there (for example “Whiteboard gallery”) and select that folder.';
  D.hu.gSetup = 'Válaszd ki, hol legyen a galériád. A böngészők magát a Dokumentumok mappát nem engedik kiválasztani: nyisd meg a Dokumentumokat, hozz létre benne egy új mappát (például „Whiteboard gallery”), és azt válaszd ki.';
  D.de.gSetup = 'Wähle, wo deine Galerie liegen soll. Browser erlauben nicht, den Ordner „Dokumente“ selbst auszuwählen: Öffne „Dokumente“, lege dort einen neuen Ordner an (zum Beispiel „Whiteboard gallery“) und wähle diesen aus.';
  D.fr.gSetup = 'Choisissez l’emplacement de votre galerie. Les navigateurs n’autorisent pas la sélection du dossier Documents lui-même : ouvrez Documents, créez-y un nouveau dossier (par exemple « Whiteboard gallery ») et sélectionnez-le.';
  D.it.gSetup = 'Scegli dove tenere la galleria. I browser non permettono di selezionare la cartella Documenti stessa: apri Documenti, crea lì una nuova cartella (per esempio “Whiteboard gallery”) e seleziona quella.';
  D.es.gSetup = 'Elige dónde estará tu galería. Los navegadores no permiten seleccionar la propia carpeta Documentos: abre Documentos, crea allí una carpeta nueva (por ejemplo «Whiteboard gallery») y selecciónala.';
  D.pt.gSetup = 'Escolha onde a galeria vai ficar. Os navegadores não permitem selecionar a própria pasta Documentos: abra Documentos, crie uma nova pasta lá (por exemplo “Whiteboard gallery”) e selecione essa pasta.';
  D.ru.gSetup = 'Выберите, где будет находиться галерея. Браузеры не позволяют выбрать саму папку «Документы»: откройте «Документы», создайте там новую папку (например, «Whiteboard gallery») и выберите её.';
  D.uk.gSetup = 'Виберіть, де буде ваша галерея. Браузери не дозволяють вибрати саму папку «Документи»: відкрийте «Документи», створіть там нову папку (наприклад, «Whiteboard gallery») і виберіть її.';
  D.tr.gSetup = 'Galerinizin nerede duracağını seçin. Tarayıcılar Belgeler klasörünün kendisinin seçilmesine izin vermez: Belgeler’i açın, içinde yeni bir klasör oluşturun (örneğin “Whiteboard gallery”) ve o klasörü seçin.';
  D.zh.gSetup = '选择图库存放的位置。浏览器不允许直接选择“文档”文件夹本身：请打开“文档”，在其中新建一个文件夹（例如“Whiteboard gallery”），然后选择该文件夹。';
  D.ja.gSetup = 'ギャラリーの保存場所を選んでください。ブラウザでは「ドキュメント」フォルダそのものは選べません。「ドキュメント」を開き、その中に新しいフォルダ（例：「Whiteboard gallery」）を作って、そのフォルダを選んでください。';
  D.ar.gSetup = 'اختر مكان المعرض. لا تسمح المتصفحات باختيار مجلد المستندات نفسه: افتح المستندات، وأنشئ داخله مجلدًا جديدًا (مثل «Whiteboard gallery») ثم اختره.';
  D.hi.gSetup = 'चुनें कि आपकी गैलरी कहाँ रहेगी। ब्राउज़र स्वयं दस्तावेज़ फ़ोल्डर चुनने नहीं देते: दस्तावेज़ खोलें, उसमें एक नया फ़ोल्डर बनाएँ (जैसे “Whiteboard gallery”) और उसी फ़ोल्डर को चुनें।';

  /* Saving back into the board's own file: [menu item, done, refused]. */
  const SAVEFILE = {
    en: ['Save to “{t}”', 'Saved to “{t}”', 'Not saved: the browser did not allow changing “{t}”.'],
    hu: ['Mentés ide: „{t}”', 'Mentve ide: „{t}”', 'Nincs mentve: a böngésző nem engedte módosítani ezt: „{t}”.'],
    de: ['In „{t}“ speichern', 'In „{t}“ gespeichert', 'Nicht gespeichert: Der Browser hat das Ändern von „{t}“ nicht erlaubt.'],
    fr: ['Enregistrer dans « {t} »', 'Enregistré dans « {t} »', 'Non enregistré : le navigateur n’a pas autorisé la modification de « {t} ».'],
    it: ['Salva in “{t}”', 'Salvato in “{t}”', 'Non salvato: il browser non ha permesso di modificare “{t}”.'],
    es: ['Guardar en «{t}»', 'Guardado en «{t}»', 'No se guardó: el navegador no permitió modificar «{t}».'],
    pt: ['Salvar em “{t}”', 'Salvo em “{t}”', 'Não foi salvo: o navegador não permitiu alterar “{t}”.'],
    ru: ['Сохранить в «{t}»', 'Сохранено в «{t}»', 'Не сохранено: браузер не разрешил изменить «{t}».'],
    uk: ['Зберегти в «{t}»', 'Збережено в «{t}»', 'Не збережено: браузер не дозволив змінити «{t}».'],
    tr: ['“{t}” dosyasına kaydet', '“{t}” dosyasına kaydedildi', 'Kaydedilmedi: tarayıcı “{t}” dosyasının değiştirilmesine izin vermedi.'],
    zh: ['保存到“{t}”', '已保存到“{t}”', '未保存：浏览器不允许修改“{t}”。'],
    ja: ['「{t}」に保存', '「{t}」に保存しました', '保存されませんでした：ブラウザが「{t}」の変更を許可しませんでした。'],
    ar: ['حفظ في «{t}»', 'تم الحفظ في «{t}»', 'لم يتم الحفظ: لم يسمح المتصفح بتعديل «{t}».'],
    hi: ['“{t}” में सहेजें', '“{t}” में सहेजा गया', 'सहेजा नहीं गया: ब्राउज़र ने “{t}” बदलने की अनुमति नहीं दी।'],
  };
  for (const l in SAVEFILE) if (D[l]) [D[l].mSaveFile, D[l].tSavedFile, D[l].tSaveDenied] = SAVEFILE[l];

  /* When the browser's own dialogs cancel by themselves (some systems do, even after a choice):
     [open fallback, save-as cancelled, gallery hint, gallery footer hint, gallery folder dialog cancelled]. */
  const NODIALOG = {
    en: ['Nothing was opened. If you chose a file, try the simple file chooser, or drag the file onto the board:',
      'Not saved. If you chose an existing file to replace, the browser may have refused: choose a new name instead.',
      'You can also drag a folder here from File Explorer: the gallery is kept in that folder.',
      'Drag a folder here from File Explorer to keep the gallery there.',
      'No folder was chosen. If you did choose one and still see this, your browser cancelled the folder dialog by itself: drag the folder from File Explorer onto this window instead.'],
    hu: ['Semmi sem nyílt meg. Ha választottál fájlt, próbáld az egyszerű fájlválasztót, vagy húzd a fájlt a táblára:',
      'Nincs mentve. Ha egy meglévő fájlt választottál felülírásra, lehet, hogy a böngésző nem engedte: adj inkább új nevet.',
      'Mappát is ide húzhatsz a Fájlkezelőből: a galéria abban a mappában lesz.',
      'Húzz ide egy mappát a Fájlkezelőből, hogy a galéria ott legyen.',
      'Nem lett mappa kiválasztva. Ha mégis választottál, és ezt látod, a böngésző magától bezárta a mappaválasztót: húzd inkább a mappát a Fájlkezelőből erre az ablakra.'],
    de: ['Nichts wurde geöffnet. Wenn du eine Datei gewählt hast, versuche die einfache Dateiauswahl oder ziehe die Datei auf die Tafel:',
      'Nicht gespeichert. Wenn du eine vorhandene Datei zum Ersetzen gewählt hast, hat der Browser das evtl. abgelehnt: wähle stattdessen einen neuen Namen.',
      'Du kannst auch einen Ordner aus dem Explorer hierher ziehen: Die Galerie liegt dann in diesem Ordner.',
      'Ziehe einen Ordner aus dem Explorer hierher, um die Galerie dort zu speichern.',
      'Kein Ordner gewählt. Wenn du einen gewählt hast und dies trotzdem siehst, hat der Browser den Ordnerdialog von selbst abgebrochen: Ziehe den Ordner stattdessen aus dem Explorer auf dieses Fenster.'],
    fr: ['Rien n’a été ouvert. Si vous avez choisi un fichier, essayez le sélecteur simple, ou faites glisser le fichier sur le tableau :',
      'Non enregistré. Si vous avez choisi un fichier existant à remplacer, le navigateur a pu refuser : choisissez plutôt un nouveau nom.',
      'Vous pouvez aussi faire glisser un dossier ici depuis l’Explorateur : la galerie sera gardée dans ce dossier.',
      'Faites glisser un dossier ici depuis l’Explorateur pour y garder la galerie.',
      'Aucun dossier choisi. Si vous en avez choisi un et voyez quand même ceci, le navigateur a annulé la fenêtre de lui-même : faites plutôt glisser le dossier depuis l’Explorateur sur cette fenêtre.'],
    it: ['Non è stato aperto nulla. Se hai scelto un file, prova il selettore semplice o trascina il file sulla lavagna:',
      'Non salvato. Se hai scelto un file esistente da sostituire, il browser potrebbe averlo rifiutato: scegli invece un nuovo nome.',
      'Puoi anche trascinare qui una cartella da Esplora file: la galleria sarà tenuta in quella cartella.',
      'Trascina qui una cartella da Esplora file per tenerci la galleria.',
      'Nessuna cartella scelta. Se ne hai scelta una e vedi comunque questo, il browser ha annullato da solo la finestra: trascina invece la cartella da Esplora file su questa finestra.'],
    es: ['No se abrió nada. Si elegiste un archivo, prueba el selector simple o arrastra el archivo a la pizarra:',
      'No se guardó. Si elegiste un archivo existente para reemplazarlo, puede que el navegador lo rechazara: elige un nombre nuevo.',
      'También puedes arrastrar aquí una carpeta desde el Explorador: la galería se guardará en esa carpeta.',
      'Arrastra aquí una carpeta desde el Explorador para guardar la galería en ella.',
      'No se eligió ninguna carpeta. Si elegiste una y aun así ves esto, el navegador canceló el diálogo por sí solo: arrastra la carpeta desde el Explorador a esta ventana.'],
    pt: ['Nada foi aberto. Se você escolheu um arquivo, tente o seletor simples ou arraste o arquivo para o quadro:',
      'Não foi salvo. Se você escolheu um arquivo existente para substituir, o navegador pode ter recusado: escolha um novo nome.',
      'Você também pode arrastar uma pasta do Explorador para cá: a galeria ficará nessa pasta.',
      'Arraste uma pasta do Explorador para cá para manter a galeria nela.',
      'Nenhuma pasta escolhida. Se você escolheu uma e ainda vê isto, o navegador cancelou a janela sozinho: arraste a pasta do Explorador para esta janela.'],
    ru: ['Ничего не открыто. Если вы выбрали файл, попробуйте простой выбор файла или перетащите файл на доску:',
      'Не сохранено. Если вы выбрали существующий файл для замены, браузер мог отказать: выберите новое имя.',
      'Можно также перетащить сюда папку из Проводника: галерея будет храниться в ней.',
      'Перетащите сюда папку из Проводника, чтобы хранить галерею в ней.',
      'Папка не выбрана. Если вы её выбрали, но видите это, браузер сам закрыл окно выбора: перетащите папку из Проводника в это окно.'],
    uk: ['Нічого не відкрито. Якщо ви вибрали файл, спробуйте простий вибір файлу або перетягніть файл на дошку:',
      'Не збережено. Якщо ви вибрали наявний файл для заміни, браузер міг відмовити: виберіть нову назву.',
      'Можна також перетягнути сюди папку з Провідника: галерея зберігатиметься в ній.',
      'Перетягніть сюди папку з Провідника, щоб зберігати галерею в ній.',
      'Папку не вибрано. Якщо ви її вибрали, але бачите це, браузер сам закрив вікно вибору: перетягніть папку з Провідника в це вікно.'],
    tr: ['Hiçbir şey açılmadı. Bir dosya seçtiyseniz basit dosya seçiciyi deneyin veya dosyayı tahtaya sürükleyin:',
      'Kaydedilmedi. Değiştirmek için var olan bir dosya seçtiyseniz tarayıcı reddetmiş olabilir: bunun yerine yeni bir ad seçin.',
      'Dosya Gezgini’nden buraya bir klasör de sürükleyebilirsiniz: galeri o klasörde tutulur.',
      'Galeriyi orada tutmak için Dosya Gezgini’nden buraya bir klasör sürükleyin.',
      'Klasör seçilmedi. Bir klasör seçtiyseniz ve yine de bunu görüyorsanız tarayıcı pencereyi kendiliğinden kapattı: klasörü Dosya Gezgini’nden bu pencereye sürükleyin.'],
    zh: ['未打开任何文件。如果你选了文件，请试试简单文件选择器，或把文件拖到白板上：',
      '未保存。如果你选择了要替换的已有文件，浏览器可能拒绝了：请改用新名称。',
      '也可以从文件资源管理器把文件夹拖到这里：图库将保存在该文件夹中。',
      '从文件资源管理器把文件夹拖到这里，即可把图库放在那里。',
      '未选择文件夹。如果你已选择却仍看到此提示，说明浏览器自行取消了对话框：请从文件资源管理器把文件夹拖到此窗口。'],
    ja: ['何も開かれませんでした。ファイルを選んだ場合は、簡易ファイル選択を試すか、ファイルをボードにドラッグしてください：',
      '保存されませんでした。既存のファイルを置き換えようとした場合、ブラウザが拒否した可能性があります。新しい名前を選んでください。',
      'エクスプローラーからフォルダをここにドラッグすることもできます。ギャラリーはそのフォルダに保存されます。',
      'エクスプローラーからフォルダをここにドラッグすると、ギャラリーをそこに保存できます。',
      'フォルダが選ばれていません。選んだのにこれが表示される場合、ブラウザがダイアログを自動的に取り消しています。エクスプローラーからフォルダをこのウィンドウにドラッグしてください。'],
    ar: ['لم يُفتح شيء. إذا اخترت ملفًا فجرّب أداة الاختيار البسيطة، أو اسحب الملف إلى اللوح:',
      'لم يتم الحفظ. إذا اخترت ملفًا موجودًا لاستبداله فربما رفض المتصفح ذلك: اختر اسمًا جديدًا بدلًا منه.',
      'يمكنك أيضًا سحب مجلد إلى هنا من مستكشف الملفات: سيُحفظ المعرض في ذلك المجلد.',
      'اسحب مجلدًا إلى هنا من مستكشف الملفات لحفظ المعرض فيه.',
      'لم يتم اختيار مجلد. إذا اخترت مجلدًا وما زلت ترى هذا، فقد ألغى المتصفح النافذة من تلقاء نفسه: اسحب المجلد من مستكشف الملفات إلى هذه النافذة.'],
    hi: ['कुछ नहीं खुला। अगर आपने फ़ाइल चुनी थी, तो साधारण फ़ाइल चयनकर्ता आज़माएँ या फ़ाइल को बोर्ड पर खींचें:',
      'सहेजा नहीं गया। अगर आपने बदलने के लिए कोई मौजूदा फ़ाइल चुनी थी, तो ब्राउज़र ने मना किया होगा: इसके बजाय नया नाम चुनें।',
      'आप File Explorer से कोई फ़ोल्डर यहाँ खींच भी सकते हैं: गैलरी उसी फ़ोल्डर में रहेगी।',
      'गैलरी को वहाँ रखने के लिए File Explorer से कोई फ़ोल्डर यहाँ खींचें।',
      'कोई फ़ोल्डर नहीं चुना गया। अगर आपने चुना था और फिर भी यह दिख रहा है, तो ब्राउज़र ने डायलॉग अपने-आप रद्द कर दिया: इसके बजाय File Explorer से फ़ोल्डर को इस विंडो पर खींचें।'],
  };
  /* Import: [menu item, picture placed, unreadable file, PDF from another program]. */
  const IMPORT = {
    en: ['Import…', 'Picture added', 'This file could not be imported.', 'Only PDFs exported from Whiteboard can be imported. For other PDFs, import a PNG or JPEG of the page.'],
    hu: ['Importálás…', 'Kép hozzáadva', 'Ezt a fájlt nem sikerült importálni.', 'Csak a Whiteboardból exportált PDF-ek importálhatók. Más PDF-ből az oldal PNG vagy JPEG képét importáld.'],
    de: ['Importieren…', 'Bild hinzugefügt', 'Diese Datei konnte nicht importiert werden.', 'Nur aus Whiteboard exportierte PDFs lassen sich importieren. Importiere bei anderen PDFs ein PNG- oder JPEG-Bild der Seite.'],
    fr: ['Importer…', 'Image ajoutée', 'Ce fichier n’a pas pu être importé.', 'Seuls les PDF exportés depuis Whiteboard peuvent être importés. Pour les autres PDF, importez une image PNG ou JPEG de la page.'],
    it: ['Importa…', 'Immagine aggiunta', 'Impossibile importare questo file.', 'Si possono importare solo i PDF esportati da Whiteboard. Per gli altri PDF importa un’immagine PNG o JPEG della pagina.'],
    es: ['Importar…', 'Imagen añadida', 'No se pudo importar este archivo.', 'Solo se pueden importar los PDF exportados desde Whiteboard. Para otros PDF, importa una imagen PNG o JPEG de la página.'],
    pt: ['Importar…', 'Imagem adicionada', 'Não foi possível importar este arquivo.', 'Só é possível importar PDFs exportados do Whiteboard. Para outros PDFs, importe uma imagem PNG ou JPEG da página.'],
    ru: ['Импорт…', 'Изображение добавлено', 'Не удалось импортировать этот файл.', 'Импортировать можно только PDF, экспортированные из Whiteboard. Для других PDF импортируйте PNG- или JPEG-изображение страницы.'],
    uk: ['Імпорт…', 'Зображення додано', 'Не вдалося імпортувати цей файл.', 'Імпортувати можна лише PDF, експортовані з Whiteboard. Для інших PDF імпортуйте PNG- або JPEG-зображення сторінки.'],
    tr: ['İçe aktar…', 'Resim eklendi', 'Bu dosya içe aktarılamadı.', 'Yalnızca Whiteboard’dan dışa aktarılan PDF’ler içe aktarılabilir. Diğer PDF’ler için sayfanın PNG veya JPEG görüntüsünü içe aktarın.'],
    zh: ['导入…', '已添加图片', '无法导入此文件。', '只能导入从 Whiteboard 导出的 PDF。其他 PDF 请导入页面的 PNG 或 JPEG 图片。'],
    ja: ['インポート…', '画像を追加しました', 'このファイルはインポートできませんでした。', 'インポートできるのは Whiteboard から書き出した PDF だけです。その他の PDF は、ページの PNG または JPEG 画像をインポートしてください。'],
    ar: ['استيراد…', 'تمت إضافة الصورة', 'تعذّر استيراد هذا الملف.', 'يمكن استيراد ملفات PDF المصدَّرة من Whiteboard فقط. لملفات PDF الأخرى، استورد صورة PNG أو JPEG للصفحة.'],
    hi: ['इम्पोर्ट…', 'चित्र जोड़ा गया', 'यह फ़ाइल इम्पोर्ट नहीं हो सकी।', 'केवल Whiteboard से एक्सपोर्ट की गई PDF इम्पोर्ट की जा सकती हैं। दूसरी PDF के लिए पेज की PNG या JPEG इमेज इम्पोर्ट करें।'],
  };
  for (const l in IMPORT) if (D[l]) [D[l].mImport, D[l].tImported, D[l].tImportFail, D[l].tImportPdf] = IMPORT[l];
  for (const l in NODIALOG) if (D[l]) [D[l].tOpenFallback, D[l].tSaveAsAbort, D[l].gDrop, D[l].gDropShort, D[l].gPickAbort] = NODIALOG[l];

  /* Limits of running from a local file (file://): no folder access, and existing files cannot be replaced. */
  const LOCAL = {
    en: ['Stored inside this browser. A page opened from a local file is not allowed to use folders; open the app from its web address or install it to keep the gallery in a real folder.',
      'Not saved. Opened from a local file, the app may create new files but the browser does not let it replace existing ones. Choose a new name, or use the installed app.'],
    hu: ['Ebben a böngészőben tárolva. Helyi fájlból megnyitva az oldal nem használhat mappákat; nyisd meg az alkalmazást a webcíméről vagy telepítsd, ha valódi mappában szeretnéd tartani a galériát.',
      'Nincs elmentve. Helyi fájlból megnyitva az alkalmazás létrehozhat új fájlokat, de a böngésző nem engedi a meglévők felülírását. Adj új nevet, vagy használd a telepített alkalmazást.'],
    de: ['In diesem Browser gespeichert. Eine aus einer lokalen Datei geöffnete Seite darf keine Ordner verwenden; öffne die App über ihre Webadresse oder installiere sie, um die Galerie in einem echten Ordner zu halten.',
      'Nicht gespeichert. Aus einer lokalen Datei geöffnet darf die App neue Dateien anlegen, aber der Browser lässt sie keine vorhandenen ersetzen. Wähle einen neuen Namen oder nutze die installierte App.'],
    fr: ['Stockée dans ce navigateur. Une page ouverte depuis un fichier local n’a pas le droit d’utiliser des dossiers ; ouvrez l’app depuis son adresse web ou installez-la pour garder la galerie dans un vrai dossier.',
      'Non enregistré. Ouverte depuis un fichier local, l’app peut créer de nouveaux fichiers, mais le navigateur ne la laisse pas remplacer ceux qui existent. Choisissez un nouveau nom ou utilisez l’app installée.'],
    it: ['Salvata in questo browser. Una pagina aperta da un file locale non può usare le cartelle; apri l’app dal suo indirizzo web o installala per tenere la galleria in una vera cartella.',
      'Non salvato. Aperta da un file locale, l’app può creare nuovi file ma il browser non le permette di sostituire quelli esistenti. Scegli un nuovo nome o usa l’app installata.'],
    es: ['Guardada en este navegador. Una página abierta desde un archivo local no puede usar carpetas; abre la app desde su dirección web o instálala para tener la galería en una carpeta real.',
      'No se guardó. Abierta desde un archivo local, la app puede crear archivos nuevos, pero el navegador no le permite reemplazar los existentes. Elige un nombre nuevo o usa la app instalada.'],
    pt: ['Guardada neste navegador. Uma página aberta de um arquivo local não pode usar pastas; abra o app pelo endereço web ou instale-o para manter a galeria em uma pasta real.',
      'Não foi salvo. Aberto de um arquivo local, o app pode criar arquivos novos, mas o navegador não deixa substituir os existentes. Escolha um novo nome ou use o app instalado.'],
    ru: ['Хранится в этом браузере. Странице, открытой из локального файла, нельзя работать с папками; откройте приложение по веб-адресу или установите его, чтобы галерея лежала в настоящей папке.',
      'Не сохранено. Приложение, открытое из локального файла, может создавать новые файлы, но браузер не позволяет заменять существующие. Выберите новое имя или используйте установленное приложение.'],
    uk: ['Зберігається в цьому браузері. Сторінці, відкритій з локального файлу, не можна працювати з папками; відкрийте застосунок за веб-адресою або встановіть його, щоб галерея була у справжній папці.',
      'Не збережено. Застосунок, відкритий з локального файлу, може створювати нові файли, але браузер не дозволяє замінювати наявні. Виберіть нову назву або скористайтеся встановленим застосунком.'],
    tr: ['Bu tarayıcıda saklanır. Yerel bir dosyadan açılan sayfanın klasör kullanmasına izin verilmez; galeriyi gerçek bir klasörde tutmak için uygulamayı web adresinden açın veya yükleyin.',
      'Kaydedilmedi. Yerel bir dosyadan açıldığında uygulama yeni dosya oluşturabilir, ancak tarayıcı var olanların değiştirilmesine izin vermez. Yeni bir ad seçin veya yüklü uygulamayı kullanın.'],
    zh: ['存放在此浏览器中。从本地文件打开的页面不能使用文件夹；请从网址打开应用或安装应用，才能把图库放在真正的文件夹里。',
      '未保存。从本地文件打开时，应用可以新建文件，但浏览器不允许它替换已有文件。请换一个名称，或使用已安装的应用。'],
    ja: ['このブラウザ内に保存されています。ローカルファイルから開いたページはフォルダを使えません。ギャラリーを実際のフォルダに置くには、Web アドレスからアプリを開くか、インストールしてください。',
      '保存されませんでした。ローカルファイルから開いた場合、アプリは新しいファイルを作成できますが、ブラウザは既存のファイルの置き換えを許可しません。別の名前を選ぶか、インストールしたアプリを使ってください。'],
    ar: ['مخزَّن داخل هذا المتصفح. الصفحة المفتوحة من ملف محلي لا يُسمح لها باستخدام المجلدات؛ افتح التطبيق من عنوانه على الويب أو ثبّته ليكون المعرض في مجلد حقيقي.',
      'لم يتم الحفظ. عند فتح التطبيق من ملف محلي يمكنه إنشاء ملفات جديدة، لكن المتصفح لا يسمح له باستبدال الملفات الموجودة. اختر اسمًا جديدًا أو استخدم التطبيق المثبَّت.'],
    hi: ['इसी ब्राउज़र में संग्रहीत। स्थानीय फ़ाइल से खोले गए पेज को फ़ोल्डर इस्तेमाल करने की अनुमति नहीं होती; गैलरी को असली फ़ोल्डर में रखने के लिए ऐप को उसके वेब पते से खोलें या इंस्टॉल करें।',
      'सहेजा नहीं गया। स्थानीय फ़ाइल से खोलने पर ऐप नई फ़ाइलें बना सकता है, पर ब्राउज़र मौजूदा फ़ाइलें बदलने नहीं देता। नया नाम चुनें या इंस्टॉल किया हुआ ऐप इस्तेमाल करें।'],
  };
  for (const code in LOCAL) { D[code].gLocalNote = LOCAL[code][0]; D[code].tLocalSave = LOCAL[code][1]; }

  /* Choosing the folder for a board saved to the gallery for the first time: [question, button]. */
  const SAVE_HERE = {
    en: ['Choose where to save “{t}”', 'Save here'], hu: ['Válaszd ki, hová mentsük: „{t}”', 'Mentés ide'],
    de: ['Wähle, wo „{t}“ gespeichert werden soll', 'Hier speichern'], fr: ['Choisissez où enregistrer « {t} »', 'Enregistrer ici'],
    it: ['Scegli dove salvare “{t}”', 'Salva qui'], es: ['Elige dónde guardar «{t}»', 'Guardar aquí'],
    pt: ['Escolha onde salvar “{t}”', 'Salvar aqui'], ru: ['Выберите, куда сохранить «{t}»', 'Сохранить здесь'],
    uk: ['Виберіть, куди зберегти «{t}»', 'Зберегти тут'], tr: ['“{t}” nereye kaydedilsin?', 'Buraya kaydet'],
    zh: ['选择“{t}”的保存位置', '保存到这里'], ja: ['「{t}」の保存先を選んでください', 'ここに保存'],
    ar: ['اختر مكان حفظ «{t}»', 'حفظ هنا'], hi: ['चुनें कि “{t}” कहाँ सहेजना है', 'यहाँ सहेजें'],
  };
  for (const code in SAVE_HERE) { D[code].gSaving = SAVE_HERE[code][0]; D[code].gSaveHere = SAVE_HERE[code][1]; }

  WB.I18N = D;
  let lang = 'en';

  /* The best supported language for this device's preferences. */
  WB.systemLang = function () {
    for (const l of navigator.languages || [navigator.language || 'en']) {
      const code = String(l).toLowerCase().split('-')[0];
      if (D[code]) return code;
    }
    return 'en';
  };
  WB.setLang = function (code) { lang = D[code] ? code : 'en'; return lang; };
  WB.lang = () => lang;
  WB.t = function (key, vars) {
    const s = (D[lang] && D[lang][key]) || D.en[key] || key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, n) => (n in vars ? vars[n] : '')) : s;
  };

  /* Fill every element that carries a translation key:
       data-i18n="key"        -> text
       data-i18n-label="key"  -> aria-label
       data-i18n-title="key"  -> tooltip (plus the shortcut in data-keys, if any) */
  WB.localize = function (root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = WB.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', WB.t(el.dataset.i18nLabel)); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = WB.t(el.dataset.i18nTitle) + (el.dataset.keys ? ` (${el.dataset.keys})` : '');
    });
    document.documentElement.lang = lang;
    const rtl = lang === 'ar';
    document.querySelectorAll('.sheet, .menu, #toast, #sel-bar').forEach((el) => { el.dir = rtl ? 'rtl' : 'ltr'; });
  };
})();
