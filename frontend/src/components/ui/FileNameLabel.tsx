type FileNameLabelProps = {
  name: string;
  className?: string;
};

export function FileNameLabel({ name, className = "" }: FileNameLabelProps) {
  return (
    <p
      title={name}
      className={`max-w-full min-w-0 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words text-sm font-semibold leading-5 text-white ${className}`}
    >
      {name}
    </p>
  );
}
