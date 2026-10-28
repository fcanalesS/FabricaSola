# Fuentes

`nunito-latin.woff2` es Nunito, de peso variable (200 a 1000), solo con el
subconjunto latino: el que sirve Google Fonts para `subsets: ["latin"]`. Cubre
el español entero. Las letras fuera de ese rango salen con la fuente de
respaldo del sistema.

Va en el repositorio para que la aplicación no dependa de Google Fonts al
compilar: en el equipo del trabajo la red puede bloquearlo, y entonces no
arranca. Se copió el 17 de octubre de 2026 del caché de `next/font/google`,
que la había bajado de Google Fonts tal cual.

Nunito: Copyright 2014 The Nunito Project Authors
(https://github.com/googlefonts/nunito). Licencia SIL Open Font License 1.1
(https://openfontlicense.org), que permite usarla y redistribuirla con la
aplicación.
