import crypto from "node:crypto";
import type { PoolClient, QueryResult } from "pg";
import { postgres } from "../config/postgres.js";

type Row = Record<string, any>;
type Filter = Record<string, any>;
type Update = Record<string, any>;
type Queryable = Pick<PoolClient, "query">;

export type Relation = {
  model: () => PgModel;
  many?: boolean;
};

export type PgModelConfig = {
  table: string;
  columns: readonly string[];
  columnMap?: Record<string, string>;
  json?: readonly string[];
  defaults?: Record<string, unknown | (() => unknown)>;
  relations?: Record<string, Relation>;
  timestamps?: boolean;
};

const snake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const camel = (value: string) => value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

function jsonReady(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonReady);
  if (!value || typeof value !== "object") return value;
  const result: Row = {};
  for (const [key, item] of Object.entries(value)) result[key] = jsonReady(item);
  if (Object.keys(result).length && !result._id && ("createdAt" in result || "author" in result || "name" in result || "type" in result)) {
    result._id = crypto.randomUUID();
  }
  return result;
}

function projectionFields(select?: string) {
  if (!select) return undefined;
  const fields = select.split(/\s+/).filter(Boolean);
  const exclusion = fields.some((field) => field.startsWith("-"));
  return { exclusion, fields: fields.map((field) => field.replace(/^-/, "")) };
}

function projectObject(value: any, select?: string) {
  const parsed = projectionFields(select);
  if (!parsed || value == null) return value;
  if (value instanceof PgDocument) return value.projectFields(select);
  const source = typeof value.toObject === "function" ? value.toObject() : value;
  if (parsed.exclusion) {
    const result = { ...source };
    for (const field of parsed.fields) delete result[field];
    return result;
  }
  const result: Row = { _id: source._id, id: source.id };
  for (const field of parsed.fields) if (own(source, field)) result[field] = source[field];
  return result;
}

export class PgDocument {
  [key: string]: any;
  private readonly __model!: PgModel;

  constructor(model: PgModel, values: Row) {
    Object.defineProperty(this, "__model", { value: model, enumerable: false });
    Object.assign(this, values);
  }

  toObject() {
    const result: Row = {};
    for (const [key, value] of Object.entries(this)) result[key] = value instanceof PgDocument ? value.toObject() : value;
    return result;
  }

  toJSON() { return this.toObject(); }

  projectFields(select?: string) {
    const parsed = projectionFields(select);
    if (!parsed) return this;
    const source = this.toObject();
    if (parsed.exclusion) {
      for (const field of parsed.fields) delete source[field];
      return new PgDocument(this.__model, source);
    }
    const result: Row = { _id: source._id, id: source.id };
    for (const field of parsed.fields) if (own(source, field)) result[field] = source[field];
    return new PgDocument(this.__model, result);
  }

  async save() {
    const updated = await this.__model.replaceById(this._id, this.toObject()) as PgDocument | null;
    if (updated) Object.assign(this, updated.toObject());
    return this;
  }

  async populate(spec: any, select?: string) {
    await this.__model.populateDocuments([this], spec, select);
    return this;
  }
}

class PgQuery<T> implements PromiseLike<T> {
  private sortValue?: string | Record<string, 1 | -1>;
  private skipValue = 0;
  private limitValue?: number;
  private selectValue?: string;
  private populateValues: Array<{ spec: any; select?: string }> = [];
  private leanValue = false;

  constructor(
    private readonly model: PgModel,
    private readonly kind: "many" | "one",
    private readonly operation: "find" | "delete" | "update",
    private readonly filter: Filter,
    private readonly update?: Update,
    private readonly options?: Row,
  ) {}

  sort(value: string | Record<string, 1 | -1>) { this.sortValue = value; return this; }
  skip(value: number) { this.skipValue = value; return this; }
  limit(value: number) { this.limitValue = value; return this; }
  select(value: string) { this.selectValue = value; return this; }
  populate(spec: any, select?: string) { this.populateValues.push({ spec, select }); return this; }
  lean() { this.leanValue = true; return this; }

  async exec(): Promise<T> {
    let result: any;
    if (this.operation === "delete") result = await this.model.deleteReturning(this.filter);
    else if (this.operation === "update") result = await this.model.updateReturning(this.filter, this.update || {}, this.options || {});
    else result = await this.model.findRows(this.filter, this.kind === "one", this.sortValue, this.skipValue, this.limitValue);
    if (result == null) return result as T;
    const documents = Array.isArray(result) ? result : [result];
    for (const population of this.populateValues) await this.model.populateDocuments(documents, population.spec, population.select);
    const projected = this.selectValue ? documents.map((document) => projectObject(document, this.selectValue)) : documents;
    const finalValue = this.leanValue ? projected.map((document) => typeof document.toObject === "function" ? document.toObject() : document) : projected;
    return (Array.isArray(result) ? finalValue : finalValue[0] ?? null) as T;
  }

  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export class PgModel {
  readonly config: PgModelConfig;
  private readonly properties: Set<string>;
  private readonly jsonProperties: Set<string>;

  constructor(config: PgModelConfig) {
    this.config = config;
    this.properties = new Set(config.columns);
    if (config.timestamps !== false) { this.properties.add("createdAt"); this.properties.add("updatedAt"); }
    this.jsonProperties = new Set(config.json || []);
  }

  private column(property: string) {
    const top = property.split(".")[0].replace(/^_id$/, "id");
    if (top === "id") return "id";
    if (!this.properties.has(top)) return undefined;
    return this.config.columnMap?.[top] || snake(top);
  }

  private property(column: string) {
    const mapped = Object.entries(this.config.columnMap || {}).find(([, value]) => value === column)?.[0];
    return mapped || camel(column);
  }

  private hydrate(row: Row) {
    const values: Row = {};
    for (const [column, value] of Object.entries(row)) {
      const property = this.property(column);
      values[property] = this.jsonProperties.has(property) ? reviveJson(value) : value;
    }
    values._id = values.id;
    return new PgDocument(this, values);
  }

  private writableValues(input: Row, includeDefaults = false) {
    const source = { ...(includeDefaults ? Object.fromEntries(Object.entries(this.config.defaults || {}).map(([key, value]) => [key, typeof value === "function" ? value() : value])) : {}), ...input };
    const result: Array<{ property: string; column: string; value: any }> = [];
    const writableProperties = includeDefaults && this.config.timestamps !== false ? [...this.config.columns, "createdAt", "updatedAt"] : this.config.columns;
    for (const property of writableProperties) {
      if (!own(source, property)) continue;
      let value = source[property];
      if (value instanceof PgDocument) value = value._id;
      if (Array.isArray(value)) value = value.map((item) => item instanceof PgDocument ? item._id : item);
      if (this.jsonProperties.has(property)) value = JSON.stringify(jsonReady(value));
      result.push({ property, column: this.column(property)!, value });
    }
    return result;
  }

  private fieldExpression(property: string) {
    const [top, ...path] = property.split(".");
    const column = this.column(top);
    if (!column) return undefined;
    if (!path.length) return `"${column}"`;
    const jsonPath = path.map((part) => part === "_id" ? "_id" : part);
    return `"${column}" #>> '{${jsonPath.join(",")}}'`;
  }

  private where(filter: Filter, start = 1): { sql: string; values: any[] } {
    const values: any[] = [];
    const compile = (part: Filter): string => {
      const clauses: string[] = [];
      for (const [property, expected] of Object.entries(part || {})) {
        if (property === "$or") {
          clauses.push(`(${(expected as Filter[]).map((item) => compile(item)).join(" OR ") || "FALSE"})`);
          continue;
        }
        const [top, nested, nestedId] = property.split(".");
        const column = this.column(top);
        if (!column) { clauses.push("FALSE"); continue; }
        if (nested && nestedId === "_id") {
          values.push(expected);
          clauses.push(`EXISTS (SELECT 1 FROM jsonb_array_elements("${column}") item WHERE item->>'_id' = $${start + values.length - 1})`);
          continue;
        }
        const expression = this.fieldExpression(property)!;
        const regex = expected instanceof RegExp ? expected : expected?.$regex instanceof RegExp ? expected.$regex : undefined;
        if (regex || (expected && typeof expected === "object" && own(expected, "$regex"))) {
          const source = regex?.source ?? String(expected.$regex);
          values.push(source);
          if (this.jsonProperties.has(top) && !nested) clauses.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text("${column}") item WHERE item ~* $${start + values.length - 1})`);
          else clauses.push(`${expression} ${regex?.flags.includes("i") || expected.$options?.includes("i") ? "~*" : "~"} $${start + values.length - 1}`);
          continue;
        }
        if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
          for (const [operator, operand] of Object.entries(expected)) {
            if (operator === "$exists") { clauses.push(`${expression} IS ${operand ? "NOT " : ""}NULL`); continue; }
            if (operator === "$in") {
              values.push(operand);
              clauses.push(`${expression} = ANY($${start + values.length - 1})`);
              continue;
            }
            const operators: Record<string, string> = { $gt: ">", $gte: ">=", $lt: "<", $lte: "<=", $ne: "<>" };
            if (operators[operator]) { values.push(operand); clauses.push(`${expression} ${operators[operator]} $${start + values.length - 1}`); }
          }
          continue;
        }
        values.push(expected);
        clauses.push(`${expression} ${expected == null ? "IS NOT DISTINCT FROM" : "="} $${start + values.length - 1}`);
      }
      return clauses.length ? clauses.join(" AND ") : "TRUE";
    };
    return { sql: compile(filter), values };
  }

  private order(sort?: string | Record<string, 1 | -1>) {
    if (!sort) return "";
    const fields = typeof sort === "string"
      ? sort.split(/\s+/).filter(Boolean).map((field) => [field.replace(/^-/, ""), field.startsWith("-") ? -1 : 1] as const)
      : Object.entries(sort);
    const safe = fields.flatMap(([property, direction]) => {
      const expression = this.fieldExpression(property);
      return expression ? [`${expression} ${Number(direction) < 0 ? "DESC" : "ASC"}`] : [];
    });
    return safe.length ? ` ORDER BY ${safe.join(", ")}` : "";
  }

  async findRows(filter: Filter, one = false, sort?: string | Record<string, 1 | -1>, skip = 0, limit?: number) {
    const where = this.where(filter);
    const max = one ? 1 : limit;
    const pagination = `${max != null ? ` LIMIT ${Math.max(0, max)}` : ""}${skip ? ` OFFSET ${Math.max(0, skip)}` : ""}`;
    const result = await postgres.query(`SELECT * FROM "${this.config.table}" WHERE ${where.sql}${this.order(sort)}${pagination}`, where.values);
    const documents = result.rows.map((row) => this.hydrate(row));
    return one ? documents[0] ?? null : documents;
  }

  find(filter: Filter = {}) { return new PgQuery<PgDocument[]>(this, "many", "find", filter); }
  findOne(filter: Filter = {}) { return new PgQuery<PgDocument | null>(this, "one", "find", filter); }
  findById(id: unknown) { return this.findOne({ _id: id }); }

  async create(input: Row) {
    const values = this.writableValues(input, true);
    const columns = values.map((item) => `"${item.column}"`);
    const placeholders = values.map((_item, index) => `$${index + 1}`);
    const result = await postgres.query(`INSERT INTO "${this.config.table}" (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`, values.map((item) => item.value));
    return this.hydrate(result.rows[0]);
  }

  async insertMany(inputs: Row[]) {
    const documents = [];
    const client = await postgres.connect();
    try {
      await client.query("BEGIN");
      for (const input of inputs) documents.push(await this.createWith(client, input));
      await client.query("COMMIT");
      return documents;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  private async createWith(client: Queryable, input: Row) {
    const values = this.writableValues(input, true);
    const result = await client.query(`INSERT INTO "${this.config.table}" (${values.map((item) => `"${item.column}"`).join(", ")}) VALUES (${values.map((_item, index) => `$${index + 1}`).join(", ")}) RETURNING *`, values.map((item) => item.value));
    return this.hydrate((result as QueryResult).rows[0]);
  }

  async countDocuments(filter: Filter = {}) { const where = this.where(filter); const result = await postgres.query(`SELECT count(*)::int AS count FROM "${this.config.table}" WHERE ${where.sql}`, where.values); return result.rows[0].count; }
  async exists(filter: Filter) { const where = this.where(filter); const result = await postgres.query(`SELECT id FROM "${this.config.table}" WHERE ${where.sql} LIMIT 1`, where.values); return result.rows[0] ? { _id: result.rows[0].id } : null; }

  findOneAndUpdate(filter: Filter, update: Update, options: Row = {}) { return new PgQuery<PgDocument | null>(this, "one", "update", filter, update, options); }
  findByIdAndUpdate(id: unknown, update: Update, options: Row = {}) { return this.findOneAndUpdate({ _id: id }, update, options); }
  findOneAndDelete(filter: Filter) { return new PgQuery<PgDocument | null>(this, "one", "delete", filter); }

  async updateReturning(filter: Filter, update: Update, options: Row): Promise<PgDocument | null> {
    const existing = await this.findRows(filter, true) as PgDocument | null;
    if (!existing && options.upsert) {
      const base = Object.fromEntries(Object.entries(filter).filter(([, value]) => value == null || typeof value !== "object" || value instanceof Date));
      const inserted = await this.create({ ...base, ...(update.$setOnInsert || {}), ...Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$"))) });
      if (update.$inc) return this.updateReturning({ _id: inserted._id }, { $inc: update.$inc }, {});
      return inserted;
    }
    if (!existing) return null;
    const next = existing.toObject();
    applyUpdate(next, update, filter);
    return await this.replaceById(existing._id, next) as PgDocument | null;
  }

  async replaceById(id: string, input: Row) {
    const values = this.writableValues(input);
    if (!values.length) return this.findRows({ _id: id }, true);
    const set = values.map((item, index) => `"${item.column}" = $${index + 1}`);
    if (this.config.timestamps !== false) set.push(`updated_at = now()`);
    const result = await postgres.query(`UPDATE "${this.config.table}" SET ${set.join(", ")} WHERE id = $${values.length + 1} RETURNING *`, [...values.map((item) => item.value), id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  async updateOne(filter: Filter, update: Update) { const document = await this.updateReturning(filter, update, {}); return { matchedCount: document ? 1 : 0, modifiedCount: document ? 1 : 0 }; }

  async updateMany(filter: Filter, update: Update) {
    const documents = await this.findRows(filter) as PgDocument[];
    for (const document of documents) { const next = document.toObject(); applyUpdate(next, update, filter); await this.replaceById(document._id, next); }
    return { matchedCount: documents.length, modifiedCount: documents.length };
  }

  async deleteReturning(filter: Filter) { const where = this.where(filter); const result = await postgres.query(`DELETE FROM "${this.config.table}" WHERE id IN (SELECT id FROM "${this.config.table}" WHERE ${where.sql} LIMIT 1) RETURNING *`, where.values); return result.rows[0] ? this.hydrate(result.rows[0]) : null; }
  async deleteOne(filter: Filter) { const row = await this.deleteReturning(filter); return { deletedCount: row ? 1 : 0 }; }
  async deleteMany(filter: Filter) { const where = this.where(filter); const result = await postgres.query(`DELETE FROM "${this.config.table}" WHERE ${where.sql}`, where.values); return { deletedCount: result.rowCount || 0 }; }

  async populateDocuments(documents: PgDocument[], spec: any, select?: string) {
    const specs = Array.isArray(spec) ? spec : [typeof spec === "string" ? { path: spec, select } : spec];
    for (const item of specs) {
      const relation = this.config.relations?.[item.path];
      if (!relation) continue;
      const ids = documents.flatMap((document) => relation.many ? (document[item.path] || []) : [document[item.path]]).filter((value) => value && typeof value !== "object");
      if (!ids.length) continue;
      const related = await relation.model().findRows({ _id: { $in: [...new Set(ids.map(String))] } }) as PgDocument[];
      if (item.populate) await relation.model().populateDocuments(related, item.populate);
      const byId = new Map(related.map((document) => [String(document._id), document]));
      for (const document of documents) {
        if (relation.many) document[item.path] = (document[item.path] || []).map((id: any) => projectObject(byId.get(String(id)), item.select)).filter(Boolean);
        else document[item.path] = projectObject(byId.get(String(document[item.path])), item.select) ?? null;
      }
    }
  }
}

function applyUpdate(target: Row, update: Update, filter: Filter) {
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("$")) continue;
    if (key.includes(".")) {
      const parts = key.split("."); let current = target;
      for (const part of parts.slice(0, -1)) current = current[part] ||= {};
      current[parts.at(-1)!] = value;
    } else target[key] = value;
  }
  for (const [key, value] of Object.entries(update.$inc || {})) target[key] = Number(target[key] || 0) + Number(value);
  for (const key of Object.keys(update.$unset || {})) target[key] = null;
  for (const [key, value] of Object.entries(update.$push || {})) target[key] = [...(target[key] || []), jsonReady(value)];
  for (const [key, value] of Object.entries(update.$addToSet || {})) if (!(target[key] || []).some((item: any) => String(item) === String(value))) target[key] = [...(target[key] || []), value];
  for (const [key, value] of Object.entries(update.$pull || {})) target[key] = (target[key] || []).filter((item: any) => typeof value === "object" ? Object.entries(value as Row).some(([field, expected]) => String(item?.[field]) !== String(expected)) : String(item) !== String(value));
  for (const [path, value] of Object.entries(update.$set || {})) {
    const [arrayName, marker, field] = path.split(".");
    if (marker === "$" && field) {
      const id = filter[`${arrayName}._id`];
      const item = (target[arrayName] || []).find((candidate: any) => String(candidate._id) === String(id));
      if (item) item[field] = value;
    } else if (path.includes(".")) {
      const parts = path.split("."); let current = target;
      for (const part of parts.slice(0, -1)) current = current[part] ||= {};
      current[parts.at(-1)!] = value;
    } else target[path] = value;
  }
}

function reviveJson(value: any): any {
  if (Array.isArray(value)) return value.map(reviveJson);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return new Date(value);
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveJson(item)]));
}

export function createPgModel(config: PgModelConfig) { return new PgModel(config); }

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await postgres.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
