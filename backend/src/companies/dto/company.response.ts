import { ApiProperty } from '@nestjs/swagger';

export class CompanyResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '12ABC34501DE35', description: 'Sem máscara.' })
  cnpj: string;

  @ApiProperty({ example: 'Oficina Exemplo Ltda' })
  legalName: string;

  @ApiProperty({ example: 'Oficina Exemplo', type: String, nullable: true })
  tradeName: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CompanyPageResponse {
  @ApiProperty({ type: [CompanyResponse] })
  items: CompanyResponse[];

  @ApiProperty({ example: 42, description: 'Total de empresas encontradas.' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
