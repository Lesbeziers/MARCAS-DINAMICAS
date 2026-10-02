# Marcas Dinámicas

Herramienta interna para estampar logos de partner sobre carátulas de Movistar Plus+.
Arrastras un lote de imágenes, asignas marca y descargas un ZIP listo para entregar.

Funciona **abriendo `index.html` con doble clic**. No necesita servidor, ni instalación,
ni conexión a internet.

---

## Cómo se usa

1. **Portada.** Arrastra las carátulas o haz clic para seleccionarlas.
2. **Selector de marcas** (columna izquierda):
   - `VARIAS MARCAS DINÁMICAS` — asignas una marca distinta a cada carátula.
   - Un partner concreto — se aplica a todo el lote de una vez.
3. Navega entre carátulas con los botones `ANTERIOR` / `SIGUIENTE` o con las
   **flechas del teclado**.
4. `EXPORTAR` se activa cuando todas están en `OK`. Hasta entonces muestra
   cuántas faltan.

## Cómo agrupa las imágenes

Dos archivos que solo se diferencien en el sufijo **`_H`** / **`_V`** son la misma
carátula y ocupan una sola fila:

```
LA_VERDAD_SOBRE_EL_SUDOR_H.jpg  ┐
LA_VERDAD_SOBRE_EL_SUDOR_V.jpg  ┘  → una carátula, dos formatos
```

Si solo hay uno de los dos formatos, el que falta aparece como un hueco gris.

## Colocación de la marca

El logo va **a hueso contra la esquina superior derecha**. El aire necesario ya viene
dentro de cada SVG, calculado para que las cuatro marcas queden alineadas entre sí.

El tamaño se escala sobre el ancho del formato de referencia:

```
anchoLogo = anchoViewBox × (anchoImagen / anchoReferencia)
```

| Familia    | Referencia  | Ratio |
|------------|-------------|-------|
| Horizontal | 1920 × 1080 | 16:9  |
| Vertical   | 1200 × 1800 | 2:3   |

En ambos formatos de referencia el logo sale al mismo tamaño absoluto. Para medidas
mayores o menores, escala proporcional.

## Exportación

| Parámetro   | Valor                                              |
|-------------|----------------------------------------------------|
| Formato     | JPG siempre (un PNG de entrada se convierte)       |
| Nombre      | El del archivo original, con su `_H` / `_V`        |
| Dimensiones | Las del original, exactas                          |
| Peso máximo | 1,5 MB por imagen                                  |
| Calidad     | La más alta que quepa bajo ese límite              |
| Entrega     | Un ZIP con todo                                    |

La calidad se busca por bisección: se mide el peso real del archivo y se ajusta hasta
clavar el valor más alto que entra en el límite. Si alguna imagen no llega a caber, o
hay que forzar mucho la compresión, la app lo avisa al terminar con la lista.

---

## Añadir un partner nuevo

1. Deja su SVG en `assets/img/` como archivo de referencia.
2. Añade una entrada en `assets/js/marcas.js` con el contenido del SVG pegado dentro
   del template literal `svg`.

No hay que tocar nada más: el desplegable, la previsualización y la exportación se
construyen a partir de esa lista.

El SVG va incrustado como texto y no enlazado por dos motivos: evita que los IDs
internos de unos SVG pisen los de otros, y permite exportar con la app abierta en
`file://` — un SVG leído del disco contaminaría el canvas y `toBlob()` dejaría de
funcionar.

---

## Estructura

```
index.html
assets/
├── css/
│   ├── fonts.css      Apercu Movistar
│   └── style.css
├── js/
│   ├── app.js         Toda la lógica
│   ├── marcas.js      Catálogo de partners
│   └── jszip.min.js   v3.10.1 (MIT)
├── img/               Logos de marca + cabecera
└── fonts/             Apercu Movistar
```

Sin build, sin dependencias que instalar, sin llamadas a internet.
