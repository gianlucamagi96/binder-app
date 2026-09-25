import { Controller, Get, Param, Query } from '@nestjs/common';
import { TcgdexService } from './tcgdex.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { ExpansionsQueryDto } from './dto/expansions-query.dto';

const DEFAULT_EXPANSIONS_LIMIT = 10;
const DEFAULT_FEATURED_LIMIT = 12;
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_CATALOG_EXPANSIONS_LIMIT = 24;

@Controller('catalog')
export class CatalogController {
  constructor(private readonly tcgdexService: TcgdexService) {}

  @Get('expansions')
  listExpansions(@Query() query: ExpansionsQueryDto) {
    return this.tcgdexService.listExpansions(
      query.limit ?? DEFAULT_CATALOG_EXPANSIONS_LIMIT,
      query.cursor,
      query.q,
    );
  }

  @Get('expansions/recent')
  getRecentExpansions(@Query() query: PaginationQueryDto) {
    return this.tcgdexService.getRecentExpansions(
      query.limit ?? DEFAULT_EXPANSIONS_LIMIT,
    );
  }

  @Get('expansions/:id')
  getExpansionDetail(@Param('id') id: string) {
    return this.tcgdexService.getExpansionDetail(id);
  }

  @Get('cards/featured')
  getFeaturedCards(@Query() query: PaginationQueryDto) {
    return this.tcgdexService.getFeaturedCards(
      query.limit ?? DEFAULT_FEATURED_LIMIT,
    );
  }

  @Get('cards/search')
  searchCards(@Query() query: SearchQueryDto) {
    return this.tcgdexService.searchCards(
      query.q,
      query.limit ?? DEFAULT_SEARCH_LIMIT,
      query.page ?? 1,
    );
  }

  @Get('illustrators')
  searchIllustrators(@Query() query: SearchQueryDto) {
    return this.tcgdexService.searchIllustrators(
      query.q,
      query.limit ?? DEFAULT_SEARCH_LIMIT,
    );
  }
}
