import "server-only";
import type { MarketType, ProjectStatus } from "@ipo/contracts";

export interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  company_name_ko: string;
  company_name_en: string | null;
  industry: string;
  website_url: string | null;
  target_market: MarketType;
  target_filing_date: string | null;
  lead_underwriter: string | null;
  status: ProjectStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDto {
  id: string;
  organizationId: string;
  name: string;
  companyNameKo: string;
  companyNameEn: string | null;
  industry: string;
  websiteUrl: string | null;
  targetMarket: MarketType;
  targetFilingDate: string | null;
  leadUnderwriter: string | null;
  status: ProjectStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function toProjectDto(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    companyNameKo: row.company_name_ko,
    companyNameEn: row.company_name_en,
    industry: row.industry,
    websiteUrl: row.website_url,
    targetMarket: row.target_market,
    targetFilingDate: row.target_filing_date,
    leadUnderwriter: row.lead_underwriter,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const PROJECT_COLUMNS =
  "id, organization_id, name, company_name_ko, company_name_en, industry, website_url, target_market, target_filing_date, lead_underwriter, status, created_by, created_at, updated_at";
