import Link from "next/link";
export default function NotFound() {
  return (
    <div className="panel py-16 text-center">
      <h1 className="text-xl font-semibold">No encontramos este registro</h1>
      <p className="muted my-4">
        Puede haberse eliminado o pertenecer a otra cuenta.
      </p>
      <Link className="btn btn-secondary" href="/movimientos">
        Volver a movimientos
      </Link>
    </div>
  );
}
