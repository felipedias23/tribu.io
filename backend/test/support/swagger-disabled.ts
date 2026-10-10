// Importado antes de ./app: o ConfigModule valida o ambiente quando o
// AppModule é importado, por isso a variável tem de existir antes (D44).
process.env.SWAGGER_ENABLED = 'false';
