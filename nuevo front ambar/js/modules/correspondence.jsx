function CorrespondencePage() {
  return (
    <>
      <div className="page-head"><div><div className="eyebrow">Archivo & Custodia</div><h1>Correspondencia</h1><p className="lead">Modulo visual preparado. No se muestran radicados ficticios porque aun no hay API de correspondencia en backend.</p></div></div>
      <Card className="an-rise">
        <Empty icon="mail" title="API pendiente">Para activar esta pantalla falta implementar endpoints de radicacion, bandeja, trazabilidad y cierre de correspondencia.</Empty>
      </Card>
    </>
  );
}

window.CorrespondencePage = CorrespondencePage;
