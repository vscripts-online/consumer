git submodule update --remote
rm -rf pb
npx proto-loader-gen-types --longs=String --enums=String --defaults --keepCase --grpcLib=@grpc/grpc-js --outDir=pb/ proto/*.proto