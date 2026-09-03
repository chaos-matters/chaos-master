import { describe, expect, it } from 'vitest'
import { analyzeFlameXmlBatch, flameXmlCompatibilityFailed, } from './flameXmlCompatibility'

const VALID = `<flames>
  <flame name="Alpha" size="800 600">
    <xform weight="1" linear="1" coefs="1 0 0 1 0 0"/>
  </flame>
  <flame name="Beta" size="800 600">
    <xform weight="1" spherical="1" coefs="1 0 0 1 0 0"/>
  </flame>
</flames>`

describe('analyzeFlameXmlBatch', () => {
  it('audits every flame in a multi-flame document using the shared importer', () => {
    const report = analyzeFlameXmlBatch([
      { path: 'pack.flame', xml: VALID, bytes: VALID.length },
    ])

    expect(report.summary).toEqual({
      files: 1,
      flames: 2,
      importable: 2,
      importableWithLoss: 0,
      invalidFlames: 0,
      invalidFiles: 0,
      invalid: 0,
    })
    expect(report.files[0]!.flames.map((flame) => flame.name)).toEqual([
      'Alpha',
      'Beta',
    ])
    expect(report.files[0]!.flames[1]!.variationTypes).toEqual(['sphericalVar'])
  })

  it('distinguishes lossy imports from invalid entries without dropping siblings', () => {
    const xml = `<flames>
      <flame name="Lossy" size="800 600">
        <xform weight="1" linear="1" unsupported_plugin="1" coefs="1 0 0 1 0 0"/>
      </flame>
      <flame name="Broken" size="800 600" />
    </flames>`
    const report = analyzeFlameXmlBatch([
      { path: 'mixed.xml', xml, bytes: xml.length },
    ])

    expect(report.summary).toMatchObject({
      flames: 2,
      importableWithLoss: 1,
      invalid: 1,
    })
    expect(report.files[0]!.status).toBe('invalid')
    expect(report.files[0]!.flames[0]!.diagnostics[0]).toContain(
      'unsupported_plugin',
    )
    expect(report.files[0]!.flames[1]!.diagnostics[0]).toContain('no <xform>')
  })

  it('sorts paths and reports malformed documents deterministically', () => {
    const inputs = [
      { path: 'z.flame', xml: '<not-flame />', bytes: 13 },
      { path: 'Ä.flame', xml: VALID, bytes: VALID.length },
      { path: 'a.flame', xml: VALID, bytes: VALID.length },
    ]

    const first = analyzeFlameXmlBatch(inputs)
    const second = analyzeFlameXmlBatch([...inputs].reverse())

    expect(second).toEqual(first)
    expect(first.files.map((file) => file.path)).toEqual([
      'a.flame',
      'z.flame',
      'Ä.flame',
    ])
    expect(first.summary.invalid).toBe(1)
    expect(first.summary.invalidFiles).toBe(1)
    expect(first.summary.invalidFlames).toBe(0)
  })

  it('marks every unsupported active behavior as lossy', () => {
    const xml = `<flames>
      <flame name="Unknown final attr" size="800 600">
        <xform weight="1" linear="1" coefs="1 0 0 1 0 0"/>
        <finalxform mystery_plugin="1" coefs="1 0 0 1 0 0"/>
      </flame>
      <flame name="Unknown final child" size="800 600">
        <xform weight="1" linear="1" coefs="1 0 0 1 0 0"/>
        <finalxform coefs="1 0 0 1 0 0">
          <var name="mystery_plugin" weight="1"/>
        </finalxform>
      </flame>
      <flame name="Chaos matrix" size="800 600">
        <xform weight="1" linear="1" chaos="0 0" animate="1" plots="2" coefs="1 0 0 1 0 0"/>
      </flame>
    </flames>`
    const report = analyzeFlameXmlBatch([
      { path: 'lossy.flame', xml, bytes: xml.length },
    ])

    expect(report.summary.importableWithLoss).toBe(3)
    expect(flameXmlCompatibilityFailed(report)).toBe(false)
    expect(flameXmlCompatibilityFailed(report, true)).toBe(true)
    expect(
      report.files[0]!.flames.every(
        (flame) => flame.status === 'importable-with-loss',
      ),
    ).toBe(true)
    expect(report.files[0]!.flames[0]!.diagnostics.join(' ')).toContain(
      'non-linear variations',
    )
    expect(report.files[0]!.flames[2]!.diagnostics.join(' ')).toContain('chaos')
    expect(report.files[0]!.flames[2]!.diagnostics.join(' ')).toContain(
      'animate',
    )
    expect(report.files[0]!.flames[2]!.diagnostics.join(' ')).toContain('plots')
  })

  // flam3 `blur` resolves to the exact `blurVar`, so it must import cleanly —
  // no "Approximated" caveat. It used to alias to `circleBlurVar` (a different
  // radius distribution) and was reported as lossy for that reason.
  it('imports flam3 blur exactly, with no approximation warning', () => {
    const xml = `<flames>
      <flame name="Exact blur" size="800 600">
        <xform weight="1" linear="1" coefs="1 0 0 1 0 0"/>
        <xform weight="1" blur="1" coefs="1 0 0 1 0 0"/>
      </flame>
    </flames>`
    const report = analyzeFlameXmlBatch([
      { path: 'blur.flame', xml, bytes: xml.length },
    ])

    const flame = report.files[0]!.flames[0]!
    expect(flame.status).toBe('importable')
    expect(flame.variationTypes).toContain('blurVar')
    expect(flame.diagnostics.join(' ')).not.toContain('Approximated')
  })

  it('ignores inactive unknown attributes and rejects negative probabilities', () => {
    const xml = `<flames>
      <flame name="Inactive extension" size="800 600">
        <xform weight="1" linear="1" unsupported_plugin="0" coefs="1 0 0 1 0 0"/>
      </flame>
      <flame name="Negative" size="800 600">
        <xform weight="-1" linear="1" coefs="1 0 0 1 0 0"/>
        <xform weight="2" linear="1" coefs="1 0 0 1 0 0"/>
      </flame>
    </flames>`
    const report = analyzeFlameXmlBatch([
      { path: 'weights.flame', xml, bytes: xml.length },
    ])

    expect(report.files[0]!.flames[0]!.status).toBe('importable')
    expect(report.files[0]!.flames[1]!.status).toBe('invalid')
    expect(report.files[0]!.flames[1]!.diagnostics[0]).toContain(
      'negative weight',
    )
    expect(report.summary.invalidFlames).toBe(1)
    expect(report.summary.invalidFiles).toBe(0)
    expect(flameXmlCompatibilityFailed(report)).toBe(true)
  })
})
