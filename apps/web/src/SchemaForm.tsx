import { Json, pretty } from "./api";
import { JsonEditor } from "./components";
/** Schema fields are optional until the researcher sets them. JSON remains the lossless view. */
export function SchemaForm({
  schema,
  value,
  onChange,
  components,
  label = "Body",
  depth = 0,
}: {
  schema: Json;
  value: Json;
  onChange: (v: Json) => void;
  components: Json;
  label?: string;
  depth?: number;
}) {
  const resolve = (node: Json): Json => {
    if (!node?.$ref) return node ?? {};
    let next: Json = { components };
    for (const k of node.$ref.slice(2).split("/"))
      next = next?.[k.replace(/~1/g, "/").replace(/~0/g, "~")];
    return {
      ...next,
      ...Object.fromEntries(Object.entries(node).filter(([k]) => k !== "$ref")),
    };
  };
  const s = resolve(schema);
  const type = s.type ?? (s.properties ? "object" : undefined);
  const variants = s.oneOf ?? s.anyOf;
  if (depth > 3 || variants || s.allOf || type === "array" || !type)
    return (
      <div className="schema-field">
        <JsonEditor
          label={label}
          value={value ?? null}
          onChange={onChange}
          rows={6}
        />
        <details>
          <summary>Documented structure and restrictions</summary>
          <pre>{pretty(s)}</pre>
        </details>
      </div>
    );
  if (type === "object")
    return (
      <fieldset className="schema-object">
        <legend>{label}</legend>
        {Object.entries(s.properties ?? {}).map(([key, raw]) => {
          const field = resolve(raw),
            present = Object.hasOwn(value ?? {}, key),
            required = (s.required ?? []).includes(key);
          const change = (v: Json) => onChange({ ...value, [key]: v });
          return (
            <div className="schema-field" key={key}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={present}
                  onChange={(e) => {
                    const next = { ...(value ?? {}) };
                    if (e.target.checked)
                      next[key] =
                        field.enum?.[0] ??
                        (field.type === "boolean"
                          ? false
                          : field.type === "number" || field.type === "integer"
                            ? 0
                            : field.type === "object"
                              ? {}
                              : field.type === "array"
                                ? []
                                : "");
                    else delete next[key];
                    onChange(next);
                  }}
                />
                {key}
                {required ? " · Required" : ""}
              </label>
              {present && (
                <SchemaForm
                  schema={raw}
                  value={value[key]}
                  onChange={change}
                  components={components}
                  label={key}
                  depth={depth + 1}
                />
              )}
              <small>
                {field.description ?? "No field description in the source."}
              </small>
              <details>
                <summary>API details</summary>
                <p>
                  Default:{" "}
                  {Object.hasOwn(field, "default")
                    ? pretty(field.default)
                    : "Not documented"}
                  . Changes apply to the next request.
                </p>
                <pre>{pretty(field)}</pre>
              </details>
            </div>
          );
        })}
        <small>
          Omitted fields are not sent. JSON gives access to additional
          properties and unions.
        </small>
      </fieldset>
    );
  if (s.enum)
    return (
      <label className="field">
        {label}
        <select
          value={JSON.stringify(value)}
          onChange={(e) => onChange(JSON.parse(e.target.value))}
        >
          {s.enum.map((v: Json) => (
            <option key={JSON.stringify(v)} value={JSON.stringify(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      </label>
    );
  if (type === "boolean")
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  if (type === "number" || type === "integer")
    return (
      <label className="field">
        {label}
        <input
          type="number"
          min={s.minimum}
          max={s.maximum}
          step={s.multipleOf ?? (type === "integer" ? 1 : "any")}
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  return (
    <label className="field">
      {label}
      <input
        value={value ?? ""}
        minLength={s.minLength}
        maxLength={s.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
