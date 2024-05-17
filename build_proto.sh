git clone https://github.com/vscripts-online/proto
rm -rf pb
npx proto-loader-gen-types --longs=String --enums=String --defaults --keepCase --grpcLib=@grpc/grpc-js --outDir=pb/ proto/*.proto
