# Un modelo Live2D en la portada

La portada puede mostrar un modelo Live2D que elijas, dentro de su anillo. Es opcional: sin
modelo, la portada queda con su vista simple. Nada de esto entra al repositorio: el modelo tiene
la licencia de quien lo hizo y el Core de Cubism es de Live2D.

## Qué poner y dónde

```
public/live2d/
├── core/
│   └── live2dcubismcore.min.js      ← el Core de Cubism
└── modelo/
    └── (la carpeta de tu modelo, tal como viene)
        ├── <nombre>.model3.json
        ├── <nombre>.moc3
        ├── texturas, motions, física…
```

1. **El Core de Cubism.** Descarga el «Cubism SDK for Web» desde
   <https://www.live2d.com/en/sdk/download/web/>, acepta su licencia y copia
   `Core/live2dcubismcore.min.js` a `public/live2d/core/`.
2. **Tu modelo.** Copia su carpeta entera dentro de `public/live2d/modelo/`. Tiene que ser un
   modelo de Cubism 3 o posterior: el que trae un archivo `*.model3.json`. Los de Cubism 2
   (`*.model.json`) no se cargan.
3. Recarga la portada.

Si hay varios `*.model3.json`, se usa el primero por orden alfabético de su ruta. La portada lo
busca en `modelo/` y en sus subcarpetas, hasta tres niveles.

## Lo que hace y lo que no

- Lo dibuja de cuerpo entero dentro del anillo, con la animación de reposo que traiga (el grupo
  `Idle`) y la mirada siguiendo el puntero. Con el movimiento reducido del sistema, no sigue el
  puntero.
- No habla, no tiene gestos ni lee lo que pasa en la fábrica: es compañía visual.
- Si el modelo no carga (el navegador no da WebGL, falta un archivo), la portada lo dice en el
  anillo y sigue funcionando.
- Con un modelo pero sin el Core, la portada queda con su vista simple y avisa qué falta.
