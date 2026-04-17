import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('top navigation restores the production Jobs and Sessions dropdown shell', () => {
  const page = read('../app/page.tsx')

  assert.match(page, /showJobsMenu/)
  assert.match(page, /showSessionDropdown/)
  assert.match(page, /Jobs & Documents/)
  assert.match(page, /Sessions/)
  assert.match(page, /Jobs Menu/)
  assert.match(page, /Session Picker/)
})

test('domain model restores sessions, accounting documents, and file attachments', () => {
  const types = read('../lib/types.ts')

  assert.match(types, /session_id:\s*string\s*\|\s*null/)
  assert.match(types, /export interface WorkSession/)
  assert.match(types, /export interface InvoiceLineItem/)
  assert.match(types, /export interface Invoice/)
  assert.match(types, /export interface Estimate/)
  assert.match(types, /export interface Contract/)
  assert.match(types, /export interface DocumentFile/)
})

test('storage layer restores sessions, accounting documents, and document file helpers', () => {
  const storage = read('../lib/storage.ts')

  assert.match(storage, /export async function getSessions\(/)
  assert.match(storage, /export async function createSession\(/)
  assert.match(storage, /export async function activateSession\(/)
  assert.match(storage, /export async function renameSession\(/)
  assert.match(storage, /export async function copySession\(/)
  assert.match(storage, /export async function getActiveSession\(/)
  assert.match(storage, /export async function getSessionProperties\(/)
  assert.match(storage, /export async function updateSessionCounts\(/)
  assert.match(storage, /export async function closeSession\(/)
  assert.match(storage, /export async function getInvoices\(/)
  assert.match(storage, /export async function saveInvoice\(/)
  assert.match(storage, /export async function deleteInvoice\(/)
  assert.match(storage, /export function generateInvoiceNumber\(/)
  assert.match(storage, /export async function getEstimates\(/)
  assert.match(storage, /export async function saveEstimate\(/)
  assert.match(storage, /export async function deleteEstimate\(/)
  assert.match(storage, /export function generateEstimateNumber\(/)
  assert.match(storage, /export async function getContracts\(/)
  assert.match(storage, /export async function saveContract\(/)
  assert.match(storage, /export async function deleteContract\(/)
  assert.match(storage, /export function generateContractNumber\(/)
  assert.match(storage, /export async function uploadDocumentFile\(/)
  assert.match(storage, /export async function getDocumentFiles\(/)
  assert.match(storage, /directive-documents/)
})

test('standalone production document editors exist in the component tree', () => {
  const componentPaths = [
    '../components/InvoiceEditor.tsx',
    '../components/ProposalEditor.tsx',
    '../components/SmartEstimateEditor.tsx',
    '../components/ContractEditor.tsx',
    '../components/DocumentUploader.tsx',
  ]

  for (const componentPath of componentPaths) {
    assert.equal(existsSync(new URL(componentPath, import.meta.url)), true, `${componentPath} should exist`)
  }
})

test('schema and storage migrations restore work sessions and document/accounting tables', () => {
  const migrationDir = new URL('../supabase/migrations/', import.meta.url)
  const migrations = [
    '013_work_sessions.sql',
    '014_accounting_documents.sql',
  ].map((file) => readFileSync(new URL(file, migrationDir), 'utf8'))

  const combined = migrations.join('\n')

  assert.match(combined, /create table if not exists public\.work_sessions/i)
  assert.match(combined, /create table if not exists public\.invoices/i)
  assert.match(combined, /create table if not exists public\.estimates/i)
  assert.match(combined, /create table if not exists public\.contracts/i)
  assert.match(combined, /create table if not exists public\.document_files/i)
  assert.match(combined, /directive-documents/i)
})
