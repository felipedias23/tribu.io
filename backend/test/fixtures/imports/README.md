# Ficheiros de importação para os testes

Dados fictícios (D35, §3.6.1).

| Ficheiro | Origem |
|---|---|
| `carteira-utf8.csv` | Escrito à mão, separador `;`, UTF-8 |
| `carteira-windows-1252.csv` | O mesmo, convertido com `iconv -t windows-1252` (a codificação do Excel em português) |
| `carteira-libreoffice.xlsx` | O CSV aberto no LibreOffice em pt-BR e gravado em XLSX (`soffice --infilter="CSV:59,34,76,1,,1046" --convert-to xlsx`). O LibreOffice transformou o CNPJ e o CNAE em números (sem os zeros à esquerda), o valor em reais em número, a data em número de série e `=2*500000` numa fórmula |

As linhas cobrem: zero à esquerda perdido, CNPJ alfanumérico, UF em minúsculas, célula vazia, fórmula, linha vazia, CNPJ com máscara, regime abreviado e valores inválidos.
